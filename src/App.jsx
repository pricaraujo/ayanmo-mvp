import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ChevronLeft, ShoppingBag, ArrowRight, Check, Sparkles, Volume2, RotateCcw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

// --- Firebase Setup ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
let app, auth, db;
try {
  if (Object.keys(firebaseConfig).length > 0) {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (e) {
  console.log("Firebase init skipped or failed (running in mock mode):", e);
}

// --- Hook de Audiodescrição / Leitor de Tela Acessível ---
function useAudioDescription(enabled = true) {
  const speak = useCallback((text) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel(); // Interrompe fala anterior
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95; // Leitura um pouco mais pausada e clara
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}

// --- Motor Dinâmico de Estilo + Biotipo ---
function calculateStyleProfile(answers, biotype) {
  const scores = { Esportivo: 0, Elegante: 0, Criativo: 0, Clássico: 0, Dramático: 0 };

  if (answers.prioridade === 'Conforto' || answers.tecido === 'Macio e confortável') scores.Esportivo += 2;
  if (answers.prioridade === 'Elegante' || answers.guardaRoupa === 'Roupas elegantes e bem cortadas') scores.Elegante += 2;
  if (answers.percepcao?.includes('Criativa') || answers.estampas === 'Várias estampas misturadas') scores.Criativo += 2;
  if (answers.objetivo === 'Look para Trabalho' || answers.cores === 'Cores neutras (preto, branco, cinza)') scores.Clássico += 2;
  if (answers.percepcao?.includes('Marcante') || answers.percepcao?.includes('Confiante')) scores.Dramático += 2;

  const sortedStyles = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  
  return {
    aparencia: sortedStyles[0] || 'Elegante',
    comunicacao: sortedStyles[1] || 'Confiante',
    comportamento: sortedStyles[2] || 'Acessível',
    biotype: biotype || 'Oval'
  };
}

// Base Dinâmica de Produtos Recomendados por Biotipo e Estilo
function getDynamicRecommendations(biotype, style) {
  const catalog = {
    Oval: [
      {
        id: 1,
        desc: "Blazer Alongado com Decote em V Monocromático",
        details: "Ideal para biotipo Oval: cria linhas verticais que valorizam e alongam a silhueta, reduzindo volume central.",
        price: "R$ 329,90",
        store: "Zara",
        link: "https://www.zara.com/br/",
        image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600"
      },
      {
        id: 2,
        desc: "Vestido Envelope Midi em Tecido Fluído",
        details: "Corte transpassado que marca a cintura logo abaixo do busto, trazendo conforto e caimento elegante.",
        price: "R$ 249,90",
        store: "Amaro",
        link: "https://amaro.com/br/pt/",
        image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600"
      },
      {
        id: 3,
        desc: "Calça Pantalona Cintura Alta com Caimento Fluído",
        details: "Equilibra proporções mantendo visual sofisticado e extremo conforto térmico e tátil.",
        price: "R$ 189,90",
        store: "Renner",
        link: "https://www.lojasrenner.com.br/",
        image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600"
      }
    ],
    Ampulheta: [
      {
        id: 4,
        desc: "Vestido Acinturado em Alfaiataria Leve",
        details: "Acompanha as curvas naturais sem comprimir, mantendo equilíbrio estético.",
        price: "R$ 299,00",
        store: "AMARO",
        link: "https://amaro.com/br/pt/",
        image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600"
      }
    ]
  };

  return catalog[biotype] || catalog['Oval'];
}

// --- Componente Principal ---
export default function AyanmoApp() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(0); // 0 = Splash, 1 = Pergunta Acessibilidade Primeiro
  const [accessibility, setAccessibility] = useState(true); // Padrão ativado para cegos
  const [cameraActive, setCameraActive] = useState(false);
  const [biotypeDetected, setBiotypeDetected] = useState('Oval');

  const videoRef = useRef(null);
  const { speak, stop } = useAudioDescription(accessibility);

  // Formulário
  const [profile, setProfile] = useState({ nome: '', genero: '', email: '', telefone: '', aniversario: '' });
  const [answers, setAnswers] = useState({
    objetivo: '',
    prioridade: '',
    percepcao: [],
    guardaRoupa: '',
    tecido: '',
    cores: '',
    estampas: ''
  });
  const [calculatedResult, setCalculatedResult] = useState(null);

  // Autenticação Firebase
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(err => console.error(err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Leitura Automática das Telas
  const speakCurrentScreen = useCallback((stepIndex, currentAnswers = answers, currentProfile = profile) => {
    const screenTexts = {
      0: "Bem-vinda ao Ayanmo. Sua assistente de estilo acessível. Toque em qualquer lugar da tela para começar.",
      1: "Primeira pergunta de acessibilidade: Você deseja ativar a audiodescrição em voz alta durante toda a navegação? Selecione Sim ou Não.",
      2: "Cadastro do perfil. Por favor, informe seu nome e dados de contato nos campos abaixo.",
      3: "Pergunta sobre seu objetivo: O que você procura hoje? Opções: Look Casual, Look Esportivo, Look para Trabalho, Look de Festa, Moda Praia, Look para Viagem ou Moda Íntima.",
      4: "Pergunta sobre prioridade: O que mais importa para você em uma roupa? Opções: Conforto, Elegância, Delicadeza, Sensualidade, Impacto, Discrição ou Criatividade.",
      5: "Pergunta de percepção: Como você quer ser percebida com este look? Escolha até duas opções: Profissional, Confiante, Acessível, Criativa, Elegante ou Marcante.",
      6: "Guarda-roupa: Do que você mais gosta no seu guarda-roupa atual?",
      7: "Sensorialidade Têxtil: Qual tipo de tecido te atrai mais ao toque?",
      8: "Cores: Como você prefere misturar as cores no seu visual?",
      9: "Estampas: Qual tipo de estampa melhor combina com você?",
      10: "Análise de Biotipo por Câmera. A câmera está aberta. Posicione seu corpo no centro da moldura oval. Mantenha os braços levemente afastados.",
      11: `Análise finalizada! Identificamos o biotipo Oval e o estilo ${calculatedResult?.aparencia || 'Elegante'}.`,
      12: `Exibindo vitrine com recomendações personalizadas para o biotipo Oval e facilidade de audiodescrição.`
    };

    if (screenTexts[stepIndex]) {
      speak(screenTexts[stepIndex]);
    }
  }, [speak, answers, profile, calculatedResult]);

  useEffect(() => {
    speakCurrentScreen(step);
  }, [step, speakCurrentScreen]);

  // Lógica da Câmera Real (Passo 10)
  useEffect(() => {
    let stream = null;
    if (step === 10) {
      navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
        })
        .catch(err => {
          console.warn("Câmera não permitida ou indisponível, simulando modo visual:", err);
        });

      // Simula leitura de biotipo após 5s
      const timer = setTimeout(() => {
        setBiotypeDetected('Oval');
        nextStep();
      }, 5000);

      return () => {
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach(track => track.stop());
      };
    }
  }, [step]);

  // Avançar Passos
  const nextStep = () => {
    stop();
    setStep(s => {
      const next = s + 1;
      if (next === 11) {
        const res = calculateStyleProfile(answers, biotypeDetected);
        setCalculatedResult(res);
        saveToFirebase(res);
      }
      return next;
    });
  };

  const prevStep = () => {
    stop();
    setStep(s => Math.max(0, s - 1));
  };

  // Salvar Firestore
  const saveToFirebase = async (finalResult) => {
    if (!db || !user) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'ayanmo-default';
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'assessments'), {
        profile,
        answers,
        accessibility,
        calculatedResult: finalResult,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error("Erro ao salvar:", e);
    }
  };

  const handleOptionSelect = (key, value, isMulti = false, max = 1) => {
    if (isMulti) {
      let current = [...answers[key]];
      if (current.includes(value)) current = current.filter(v => v !== value);
      else if (current.length < max) current.push(value);
      setAnswers({ ...answers, [key]: current });
      speak(`Selecionado: ${value}`);
    } else {
      setAnswers({ ...answers, [key]: value });
      speak(`Selecionado: ${value}`);
      setTimeout(nextStep, 500);
    }
  };

  // RENDERIZADOR DE TELAS
  const renderContent = () => {
    switch (step) {
      case 0: // Splash Screen
        return (
          <div 
            onClick={nextStep} 
            tabIndex={0} 
            role="button" 
            aria-label="Ayanmo Assistente de Estilo. Toque aqui para iniciar."
            className="flex flex-col items-center justify-center h-full p-8 text-center cursor-pointer focus:outline-none focus:ring-4 focus:ring-[#4A3026]"
          >
            <div className="mb-8 border-4 border-[#4A3026] p-6 rotate-45">
              <div className="-rotate-45">
                <h1 className="text-4xl md:text-6xl font-bold text-[#4A3026] tracking-widest uppercase">Ayanmo</h1>
              </div>
            </div>
            <p className="text-[#1A2733] text-lg font-light tracking-wide uppercase">Tecnologia Assistiva e Consultoria de Moda</p>
            <p className="mt-12 text-[#5C879C] animate-pulse font-medium flex items-center space-x-2">
              <span>Toque ou pressione Enter para começar</span>
              <ArrowRight size={18} />
            </p>
          </div>
        );

      case 1: // PERGUNTA DE ACESSIBILIDADE PRIMEIRO QUE TUDO
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
            <Volume2 size={56} className="text-[#4A3026] mb-6 animate-bounce" />
            <h2 className="text-2xl text-[#4A3026] mb-8 font-semibold" tabIndex={0}>
              Você deseja ativar a Audiodescrição e o Leitor de Tela Acessível?
            </h2>
            <div className="flex flex-col gap-4 w-full">
              <button 
                onClick={() => { setAccessibility(true); speak("Audiodescrição ativada com sucesso."); nextStep(); }}
                className="py-5 bg-[#4A3026] text-[#F7F7F5] font-bold text-lg rounded shadow-md hover:bg-[#1A2733] focus:ring-4 focus:ring-[#5C879C]"
                aria-label="Sim, ativar audiodescrição"
              >
                SIM (Ativar Leitor de Voz)
              </button>
              <button 
                onClick={() => { setAccessibility(false); stop(); nextStep(); }}
                className="py-4 border-2 border-[#1A2733] text-[#1A2733] font-medium rounded hover:bg-[#1A2733] hover:text-[#F7F7F5]"
                aria-label="Não preciso de leitor de voz"
              >
                NÃO (Navegação Padrão)
              </button>
            </div>
          </div>
        );

      case 2: // Cadastro
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto justify-center">
            <h2 className="text-2xl text-[#4A3026] mb-6 font-semibold" tabIndex={0}>
              Por favor, informe seus dados de identificação.
            </h2>
            <form onSubmit={(e) => { e.preventDefault(); if (profile.nome) nextStep(); }} className="space-y-4">
              {['nome', 'email', 'telefone'].map((field) => (
                <div key={field} className="flex flex-col">
                  <label className="text-sm font-medium text-[#1A2733] uppercase mb-1">{field}</label>
                  <input
                    type={field === 'email' ? 'email' : 'text'}
                    required={field === 'nome'}
                    aria-label={`Campo para ${field}`}
                    className="p-3 border border-gray-400 rounded bg-white text-[#1A2733] focus:ring-2 focus:ring-[#4A3026]"
                    value={profile[field]}
                    onChange={(e) => setProfile({ ...profile, [field]: e.target.value })}
                  />
                </div>
              ))}
              <button type="submit" className="w-full mt-6 bg-[#1A2733] text-[#F7F7F5] py-4 uppercase font-bold tracking-widest rounded hover:bg-[#4A3026]">
                Continuar
              </button>
            </form>
          </div>
        );

      case 10: // SCANNER DE BIOTIPO COM CÂMERA REAL E FRAME OVAL
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 bg-[#1A2733] text-[#F7F7F5] relative overflow-hidden text-center">
            <h2 className="text-xl mb-4 font-light z-10 max-w-xs" tabIndex={0}>
              Análise Morfológica: Posicione seu corpo dentro do contorno Oval.
            </h2>

            {/* Container da Câmera / Guia */}
            <div className="relative w-64 h-80 border-2 border-[#5C879C] rounded-3xl overflow-hidden mb-6 flex items-center justify-center shadow-2xl">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              
              {/* Overlay Oval para Biotipo */}
              <div 
                className="absolute w-48 h-64 border-4 border-dashed border-amber-400 rounded-[50%] animate-pulse pointer-events-none flex items-center justify-center"
                aria-hidden="true"
              >
                <span className="bg-[#1A2733]/80 text-amber-300 px-3 py-1 text-xs rounded-full font-bold">
                  BIOTIPO OVAL
                </span>
              </div>

              <div className="absolute top-0 left-0 w-full h-1 bg-amber-400 shadow-[0_0_15px_#f59e0b] animate-[scan_2s_ease-in-out_infinite_alternate]"></div>
            </div>

            <p className="text-amber-300 font-medium animate-pulse z-10 text-sm">
              Mantenha os braços leves e afastados do corpo...
            </p>
          </div>
        );

      case 11: // Resultado
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto justify-center">
            <div className="flex items-center space-x-3 mb-4 text-[#4A3026]">
              <Sparkles className="text-[#5C879C]" />
              <h2 className="text-2xl font-bold" tabIndex={0}>Análise Concluída!</h2>
            </div>
            
            <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 space-y-4 mb-6">
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase tracking-wider">Biotipo Identificado</span>
                <p className="text-2xl font-bold text-[#4A3026]">{calculatedResult?.biotype}</p>
              </div>
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase tracking-wider">Estilo Predominante</span>
                <p className="text-xl font-medium text-[#1A2733]">{calculatedResult?.aparencia}</p>
              </div>
            </div>

            <button onClick={nextStep} className="w-full bg-[#4A3026] text-[#F7F7F5] py-4 uppercase font-bold tracking-widest rounded hover:bg-[#1A2733]">
              Ver Recomendações de Peças
            </button>
          </div>
        );

      case 12: { // Vitrine Dinâmica por Biotipo
        const items = getDynamicRecommendations(calculatedResult?.biotype || 'Oval', calculatedResult?.aparencia);
        return (
          <div className="flex flex-col h-full bg-[#F7F7F5] overflow-y-auto pb-12 p-6">
            <div className="mb-6 p-4 bg-[#1A2733] text-[#F7F7F5] rounded-lg">
              <h2 className="text-xl font-bold mb-1" tabIndex={0}>
                Sugestões para Biotipo {calculatedResult?.biotype}
              </h2>
              <p className="text-xs text-[#5C879C]">Peças selecionadas com foco em conforto, caimento e valorização corporal.</p>
            </div>

            <div className="space-y-6 max-w-md mx-auto w-full">
              {items.map(item => (
                <div key={item.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden p-4 flex flex-col gap-2">
                  <img src={item.image} alt={item.desc} className="w-full h-48 object-cover rounded" />
                  <span className="text-xs text-[#5C879C] font-bold uppercase">{item.store}</span>
                  <h3 className="font-bold text-[#1A2733]">{item.desc}</h3>
                  <p className="text-xs text-gray-600 bg-amber-50 p-2 rounded border-l-2 border-amber-400">{item.details}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-[#4A3026]">{item.price}</span>
                    <button 
                      onClick={() => window.open(item.link, '_blank')}
                      className="px-4 py-2 bg-[#4A3026] text-white rounded text-sm font-bold flex items-center space-x-1 hover:bg-[#1A2733]"
                      aria-label={`Comprar ${item.desc} por ${item.price} na loja ${item.store}`}
                    >
                      <ShoppingBag size={16} />
                      <span>Comprar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      default: { // Questionários Múltipla Escolha
        const questions = {
          3: { key: 'objetivo', title: 'O que você procura hoje?', options: ['Look Casual', 'Look Esportivo', 'Look para Trabalho', 'Look de Festa', 'Moda Praia', 'Look para Viagem', 'Moda Íntima'] },
          4: { key: 'prioridade', title: 'O que mais importa para você em uma roupa?', options: ['Conforto', 'Elegância', 'Delicadeza', 'Sensualidade', 'Impacto', 'Discrição', 'Criatividade'] },
          5: { key: 'percepcao', title: 'Como você quer ser percebida com este look? (Até 2 opções)', options: ['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante'], isMulti: true, max: 2 },
          6: { key: 'guardaRoupa', title: 'Do que você mais gosta no seu guarda-roupa?', options: ['Roupas confortáveis', 'Peças bem cortadas', 'Roupas delicadas', 'Itens básicos', 'Peças marcantes'] },
          7: { key: 'tecido', title: 'Qual tipo de tecido te atrai mais ao toque?', options: ['Macio e confortável', 'Fino e sofisticado', 'Leve e fluído', 'Estruturado'] },
          8: { key: 'cores', title: 'Como você prefere misturar as cores?', options: ['Cores intensas', 'Tons pastéis', 'Cores neutras (preto, branco)', 'Cores contrastantes'] },
          9: { key: 'estampas', title: 'Se fosse escolher uma estampa, qual seria?', options: ['Neutra sem estampa', 'Estampa pequena e discreta', 'Geométrica ou abstrata', 'Floral delicado'] }
        };
        const q = questions[step];
        if (!q) return null;

        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto w-full justify-center">
            <h2 className="text-xl md:text-2xl font-bold text-[#4A3026] mb-6" tabIndex={0}>{q.title}</h2>
            <div className="space-y-3">
              {q.options.map(opt => (
                <button
                  key={opt}
                  onClick={() => handleOptionSelect(q.key, opt, q.isMulti, q.max)}
                  className={`w-full text-left p-4 rounded border transition-all flex justify-between items-center ${
                    (q.isMulti ? answers[q.key]?.includes(opt) : answers[q.key] === opt)
                      ? 'bg-[#4A3026] text-white border-[#4A3026]'
                      : 'bg-white text-gray-800 border-gray-300 hover:border-[#4A3026]'
                  }`}
                  aria-label={opt}
                >
                  <span>{opt}</span>
                  {(q.isMulti ? answers[q.key]?.includes(opt) : answers[q.key] === opt) && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="h-screen w-full bg-[#F7F7F5] relative overflow-hidden">
      {/* Barra Superior Acessível com botão Reouvir */}
      {step > 0 && (
        <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-center">
          <button onClick={prevStep} className="p-2 bg-white rounded-full shadow text-[#1A2733]" aria-label="Voltar tela">
            <ChevronLeft size={24} />
          </button>
          
          {accessibility && (
            <button 
              onClick={() => speakCurrentScreen(step)} 
              className="px-3 py-1 bg-[#5C879C] text-white text-xs font-bold rounded-full shadow flex items-center space-x-1"
              aria-label="Reouvir mensagem em voz alta"
            >
              <RotateCcw size={14} />
              <span>Reouvir Tela</span>
            </button>
          )}
        </div>
      )}
      {renderContent()}
    </div>
  );
}
