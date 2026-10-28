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
  console.log("Firebase init skipped or failed:", e);
}

// --- Hook de Audiodescrição ---
function useAudioDescription(enabled = true) {
  const speak = useCallback((text) => {
    if (!enabled || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.95;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
  }, [enabled]);

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
  
  // Dicas de roupas baseadas no biotipo detectado
  const biotypeGuide = {
    Oval: {
      title: "Biotipo Oval",
      tip: "Foque em decotes em V, tecidos fluídos e linhas verticais que alongam a silhueta, disfarçando o volume central.",
      clothing: "Blazers alongados, vestidos envelope e calças pantalona."
    },
    Ampulheta: {
      title: "Biotipo Ampulheta",
      tip: "O objetivo é valorizar a cintura marcada com peças que acompanhem as curvas naturais sem excesso de volume.",
      clothing: "Vestidos acinturados, cintos marcantes e peças transpassadas."
    },
    Retângulo: {
      title: "Biotipo Retângulo",
      tip: "Crie a ilusão de curvas definindo mais a cintura e adicionando volume nos ombros ou quadris.",
      clothing: "Blusas com babados, saias evasê e cintos na cintura."
    },
    "Triângulo": {
      title: "Biotipo Triângulo (Pêra)",
      tip: "Valorize a parte superior do corpo, trazendo atenção para ombros e colo, equilibrando com partes inferiores retas.",
      clothing: "Blusas estruturadas, decotes amplos e calças de corte reto."
    }
  };

  return {
    aparencia: sortedStyles[0] || 'Elegante',
    comunicacao: sortedStyles[1] || 'Confiante',
    comportamento: sortedStyles[2] || 'Acessível',
    biotype: biotype || 'Oval',
    guide: biotypeGuide[biotype || 'Oval'] || biotypeGuide['Oval']
  };
}

// Vitrine Dinâmica
function getDynamicRecommendations(biotype) {
  const catalog = {
    Oval: [
      { id: 1, desc: "Blazer Alongado com Decote em V", price: "R$ 329,90", store: "Zara", link: "https://www.zara.com/br/", image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600" },
      { id: 2, desc: "Vestido Envelope Midi Fluído", price: "R$ 249,90", store: "Amaro", link: "https://amaro.com/br/pt/", image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600" }
    ],
    Ampulheta: [
      { id: 3, desc: "Vestido Acinturado Alfaiataria", price: "R$ 299,00", store: "AMARO", link: "https://amaro.com/br/pt/", image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600" }
    ]
  };
  return catalog[biotype] || catalog['Oval'];
}

export default function AyanmoApp() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(0); 
  const [accessibility, setAccessibility] = useState(true); 
  const [biotypeDetected, setBiotypeDetected] = useState('Oval');

  const videoRef = useRef(null);
  const { speak, stop } = useAudioDescription(accessibility);

  const [profile, setProfile] = useState({ nome: '', email: '', telefone: '', aniversario: '', genero: '' });
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

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch(err => console.error(err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Audiodescrição inteligente por passo incluindo perguntas e opções
  const speakCurrentScreen = useCallback((stepIndex) => {
    const questionsMap = {
      3: { title: "O que você procura hoje?", opts: ['Look Casual', 'Look Esportivo', 'Look para Trabalho', 'Look de Festa', 'Moda Praia', 'Look para Viagem', 'Moda Íntima'] },
      4: { title: "O que mais importa para você em uma roupa?", opts: ['Conforto', 'Elegância', 'Delicadeza', 'Sensualidade', 'Impacto', 'Discrição', 'Criatividade'] },
      5: { title: "Como você quer ser percebida com este look? Escolha até duas opções.", opts: ['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante'] },
      6: { title: "Do que você mais gosta no seu guarda-roupa?", opts: ['Roupas confortáveis', 'Peças bem cortadas', 'Roupas delicadas', 'Itens básicos', 'Peças marcantes'] },
      7: { title: "Qual tipo de tecido te atrai mais ao toque?", opts: ['Macio e confortável', 'Fino e sofisticado', 'Leve e fluído', 'Estruturado'] },
      8: { title: "Como você prefere misturar as cores?", opts: ['Cores intensas', 'Tons pastéis', 'Cores neutras', 'Cores contrastantes'] },
      9: { title: "Qual tipo de estampa melhor combina com você?", opts: ['Neutra sem estampa', 'Estampa pequena', 'Geométrica ou abstrata', 'Floral delicado'] }
    };

    if (stepIndex === 0) speak("Bem-vinda ao Ayanmo. Sua assistente de estilo acessível. Toque para iniciar.");
    else if (stepIndex === 1) speak("Você deseja ativar a audiodescrição e o leitor de tela acessível? Selecione Sim ou Não.");
    else if (stepIndex === 2) speak("Por favor, preencha seus dados de cadastro nos campos abaixo.");
    else if (stepIndex === 10) speak("Análise de biotipo por câmera aberta. Posicione-se no centro da moldura.");
    else if (stepIndex === 11) speak(`Análise concluída. Biotipo identificado: ${calculatedResult?.biotype || 'Oval'}. Estilo: ${calculatedResult?.aparencia}. Veja abaixo as orientações de roupas.`);
    else if (stepIndex === 12) speak("Vitrine de recomendações de peças personalizadas.");
    else if (questionsMap[stepIndex]) {
      const q = questionsMap[stepIndex];
      const textToSpeak = `${q.title}. Opções disponíveis: ${q.opts.join(', ')}.`;
      speak(textToSpeak);
    }
  }, [speak, calculatedResult]);

  useEffect(() => {
    speakCurrentScreen(step);
  }, [step, speakCurrentScreen]);

  // Simulação dinâmica e aleatória inteligente de biotipo na câmera
  useEffect(() => {
    let stream = null;
    if (step === 10) {
      navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'user' } })
        .then(s => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch(err => console.warn("Câmera indisponível:", err));

      const timer = setTimeout(() => {
        const biotypes = ['Oval', 'Ampulheta', 'Retângulo', 'Triângulo'];
        const randomBiotype = biotypes[Math.floor(Math.random() * biotypes.length)];
        setBiotypeDetected(randomBiotype);
        nextStep();
      }, 5000);

      return () => {
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach(track => track.stop());
      };
    }
  }, [step]);

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
      let current = [...(answers[key] || [])];
      if (current.includes(value)) current = current.filter(v => v !== value);
      else if (current.length < max) current.push(value);
      setAnswers({ ...answers, [key]: current });
      speak(`Selecionado: ${value}`);
    } else {
      setAnswers({ ...answers, [key]: value });
      speak(`Selecionado: ${value}`);
      setTimeout(nextStep, 400);
    }
  };

  const renderContent = () => {
    switch (step) {
      case 0:
        return (
          <div onClick={nextStep} tabIndex={0} role="button" className="flex flex-col items-center justify-center h-full p-8 text-center cursor-pointer focus:outline-none">
            <div className="mb-8 border-4 border-[#4A3026] p-6 rotate-45">
              <div className="-rotate-45"><h1 className="text-4xl md:text-6xl font-bold text-[#4A3026] tracking-widest uppercase">Ayanmo</h1></div>
            </div>
            <p className="text-[#1A2733] text-lg font-light tracking-wide uppercase">Tecnologia Assistiva e Consultoria de Moda</p>
            <p className="mt-12 text-[#5C879C] animate-pulse font-medium">Toque ou pressione Enter para começar</p>
          </div>
        );

      case 1:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
            <Volume2 size={56} className="text-[#4A3026] mb-6 animate-bounce" />
            <h2 className="text-2xl text-[#4A3026] mb-8 font-semibold">Ativar Audiodescrição e Leitor de Tela?</h2>
            <div className="flex flex-col gap-4 w-full">
              <button onClick={() => { setAccessibility(true); speak("Audiodescrição ativada."); nextStep(); }} className="py-5 bg-[#4A3026] text-[#F7F7F5] font-bold text-lg rounded shadow-md">SIM (Ativar Leitor)</button>
              <button onClick={() => { setAccessibility(false); stop(); nextStep(); }} className="py-4 border-2 border-[#1A2733] text-[#1A2733] font-medium rounded">NÃO (Padrão)</button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto justify-center overflow-y-auto">
            <h2 className="text-2xl text-[#4A3026] mb-6 font-semibold">Seus dados cadastrais</h2>
            <form onSubmit={(e) => { e.preventDefault(); if (profile.nome) nextStep(); }} className="space-y-4 pb-8">
              <input type="text" required placeholder="Nome Completo" className="p-3 border border-gray-300 rounded w-full" value={profile.nome} onChange={(e) => setProfile({ ...profile, nome: e.target.value })} />
              <input type="email" required placeholder="E-mail" className="p-3 border border-gray-300 rounded w-full" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
              <input type="tel" placeholder="Telefone" className="p-3 border border-gray-300 rounded w-full" value={profile.telefone} onChange={(e) => setProfile({ ...profile, telefone: e.target.value })} />
              <input type="date" className="p-3 border border-gray-300 rounded w-full" value={profile.aniversario} onChange={(e) => setProfile({ ...profile, aniversario: e.target.value })} />
              <div className="flex space-x-2">
                {['Feminino', 'Masculino', 'Outro'].map(g => (
                  <button type="button" key={g} onClick={() => setProfile({ ...profile, genero: g })} className={`flex-1 py-2 text-sm border rounded ${profile.genero === g ? 'bg-[#4A3026] text-white' : 'border-gray-300'}`}>{g}</button>
                ))}
              </div>
              <button type="submit" className="w-full mt-4 bg-[#1A2733] text-[#F7F7F5] py-4 uppercase font-bold rounded">Continuar</button>
            </form>
          </div>
        );

      case 5: {
        const selected = answers.percepcao || [];
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto w-full justify-center">
            <h2 className="text-xl font-bold text-[#4A3026] mb-2">Como você quer ser percebida com este look?</h2>
            <p className="text-xs text-[#5C879C] mb-6">Escolha até 2 opções.</p>
            <div className="space-y-3 mb-6">
              {['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante'].map(opt => {
                const isSelected = selected.includes(opt);
                return (
                  <button key={opt} onClick={() => handleOptionSelect('percepcao', opt, true, 2)} className={`w-full text-left p-4 rounded border flex justify-between items-center ${isSelected ? 'bg-[#4A3026] text-white' : 'bg-white'}`}>
                    <span>{opt}</span>{isSelected && <Check size={20} />}
                  </button>
                );
              })}
            </div>
            <button onClick={nextStep} disabled={selected.length === 0} className={`w-full py-4 uppercase font-bold rounded ${selected.length > 0 ? 'bg-[#4A3026] text-white' : 'bg-gray-200 text-gray-400'}`}>Avançar</button>
          </div>
        );
      }

      case 10:
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 bg-[#1A2733] text-[#F7F7F5] text-center">
            <h2 className="text-xl mb-4 font-light">Análise Morfológica: Posicione-se para leitura de biotipo.</h2>
            <div className="relative w-64 h-80 border-2 border-[#5C879C] rounded-3xl overflow-hidden mb-6 flex items-center justify-center">
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute w-48 h-64 border-4 border-dashed border-amber-400 rounded-[50%] flex items-center justify-center animate-pulse">
                <span className="bg-[#1A2733]/80 text-amber-300 px-3 py-1 text-xs rounded-full font-bold">ANALISANDO</span>
              </div>
            </div>
            <p className="text-amber-300 font-medium animate-pulse text-sm">Processando proporções...</p>
          </div>
        );

      case 11: // TELA DE RESULTADO AMPLIADA COM BIOTIPO + APARÊNCIA + GUIA DE ROUPAS
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto justify-center overflow-y-auto">
            <div className="flex items-center space-x-3 mb-4 text-[#4A3026]">
              <Sparkles className="text-[#5C879C]" />
              <h2 className="text-2xl font-bold">Análise Concluída!</h2>
            </div>
            <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 space-y-4 mb-6">
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase">Biotipo Identificado</span>
                <p className="text-2xl font-bold text-[#4A3026]">{calculatedResult?.guide.title}</p>
              </div>
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase">Estilo Predominante</span>
                <p className="text-lg font-medium text-[#1A2733]">{calculatedResult?.aparencia}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded border-l-4 border-amber-400">
                <span className="text-xs font-bold text-amber-800 uppercase block mb-1">Dica de Caimento:</span>
                <p className="text-xs text-gray-700">{calculatedResult?.guide.tip}</p>
              </div>
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase">Sugestões de Roupas Ideais</span>
                <p className="text-sm font-semibold text-[#1A2733]">{calculatedResult?.guide.clothing}</p>
              </div>
            </div>
            <button onClick={nextStep} className="w-full bg-[#4A3026] text-[#F7F7F5] py-4 uppercase font-bold rounded hover:bg-[#1A2733]">Ver Vitrine de Produtos</button>
          </div>
        );

      case 12: {
        const items = getDynamicRecommendations(calculatedResult?.biotype || 'Oval');
        return (
          <div className="flex flex-col h-full bg-[#F7F7F5] overflow-y-auto pb-12 p-6">
            <div className="mb-6 p-4 bg-[#1A2733] text-[#F7F7F5] rounded-lg">
              <h2 className="text-xl font-bold mb-1">Vitrine para {calculatedResult?.guide.title}</h2>
              <p className="text-xs text-[#5C879C]">Seleção com base nas características do seu biotipo.</p>
            </div>
            <div className="space-y-6 max-w-md mx-auto w-full">
              {items.map(item => (
                <div key={item.id} className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden p-4 flex flex-col gap-2">
                  <img src={item.image} alt={item.desc} className="w-full h-48 object-cover rounded" />
                  <span className="text-xs text-[#5C879C] font-bold uppercase">{item.store}</span>
                  <h3 className="font-bold text-[#1A2733]">{item.desc}</h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-[#4A3026]">{item.price}</span>
                    <button onClick={() => window.open(item.link, '_blank')} className="px-4 py-2 bg-[#4A3026] text-white rounded text-sm font-bold flex items-center space-x-1">
                      <ShoppingBag size={16} /><span>Comprar</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }

      default: {
        const questions = {
          3: { key: 'objetivo', title: 'O que você procura hoje?', options: ['Look Casual', 'Look Esportivo', 'Look para Trabalho', 'Look de Festa', 'Moda Praia', 'Look para Viagem', 'Moda Íntima'] },
          4: { key: 'prioridade', title: 'O que mais importa para você em uma roupa?', options: ['Conforto', 'Elegância', 'Delicadeza', 'Sensualidade', 'Impacto', 'Discrição', 'Criatividade'] },
          6: { key: 'guardaRoupa', title: 'Do que você mais gosta no seu guarda-roupa?', options: ['Roupas confortáveis', 'Peças bem cortadas', 'Roupas delicadas', 'Itens básicos', 'Peças marcantes'] },
          7: { key: 'tecido', title: 'Qual tipo de tecido te atrai mais ao toque?', options: ['Macio e confortável', 'Fino e sofisticado', 'Leve e fluído', 'Estruturado'] },
          8: { key: 'cores', title: 'Como você prefere misturar as cores?', options: ['Cores intensas', 'Tons pastéis', 'Cores neutras', 'Cores contrastantes'] },
          9: { key: 'estampas', title: 'Qual tipo de estampa melhor combina com você?', options: ['Neutra sem estampa', 'Estampa pequena', 'Geométrica ou abstrata', 'Floral delicado'] }
        };
        const q = questions[step];
        if (!q) return null;

        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto w-full justify-center">
            <h2 className="text-xl md:text-2xl font-bold text-[#4A3026] mb-6">{q.title}</h2>
            <div className="space-y-3">
              {q.options.map(opt => (
                <button key={opt} onClick={() => handleOptionSelect(q.key, opt)} className={`w-full text-left p-4 rounded border transition-all flex justify-between items-center ${answers[q.key] === opt ? 'bg-[#4A3026] text-white' : 'bg-white'}`}>
                  <span>{opt}</span>{answers[q.key] === opt && <Check size={20} />}
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
      {step > 0 && (
        <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-center">
          <button onClick={prevStep} className="p-2 bg-white rounded-full shadow text-[#1A2733]" aria-label="Voltar"><ChevronLeft size={24} /></button>
          {accessibility && (
            <button onClick={() => speakCurrentScreen(step)} className="px-3 py-1 bg-[#5C879C] text-white text-xs font-bold rounded-full shadow flex items-center space-x-1">
              <RotateCcw size={14} /><span>Reouvir Tela</span>
            </button>
          )}
        </div>
      )}
      {renderContent()}
    </div>
  );
}
