import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  ChevronLeft,
  ShoppingBag,
  ArrowRight,
  Check,
  Sparkles,
  Volume2,
  RotateCcw,
  Ruler,
  Loader2
} from 'lucide-react';
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
  console.log('Firebase init skipped or failed:', e);
}

// --- Hook de Audiodescrição ---
function useAudioDescription(enabled = true) {
  const speak = useCallback(
    (text) => {
      if (!enabled || !('speechSynthesis' in window) || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }, []);

  return { speak, stop };
}

// --- Interpretação de Biótipo (Medidas Simétricas + Proporções) ---
function interpretBiotype({ shouldersCm, waistCm, hipsCm, fallbackBiotype }) {
  const s = Number(shouldersCm) || 96;
  const w = Number(waistCm) || 74;
  const h = Number(hipsCm) || 100;

  const diffSH = Math.abs(s - h);
  const waistToHip = w / Math.max(h, 1);
  const waistToShoulder = w / Math.max(s, 1);

  let biotype = fallbackBiotype || 'Ampulheta';

  if (h - s >= 6 && waistToHip > 0.72) {
    biotype = 'Triângulo';
  } else if (s - h >= 6 && waistToShoulder > 0.72) {
    biotype = 'Retângulo';
  } else if (waistToHip >= 0.88 && waistToShoulder >= 0.88) {
    biotype = 'Oval';
  } else if (diffSH <= 5 && waistToHip < 0.82) {
    biotype = 'Ampulheta';
  } else if (diffSH <= 5 && waistToHip >= 0.82) {
    biotype = 'Retângulo';
  }

  return biotype;
}

// --- Motor Dinâmico de Estilo + Biotipo ---
function calculateStyleProfile(answers, biotype) {
  const scores = { Esportivo: 0, Elegante: 0, Criativo: 0, Clássico: 0, Dramático: 0 };

  const prioridadeList = Array.isArray(answers.prioridade) ? answers.prioridade : answers.prioridade ? [answers.prioridade] : [];
  const tecidoList = Array.isArray(answers.tecido) ? answers.tecido : answers.tecido ? [answers.tecido] : [];
  const guardaRoupaList = Array.isArray(answers.guardaRoupa) ? answers.guardaRoupa : answers.guardaRoupa ? [answers.guardaRoupa] : [];
  const percepcaoList = Array.isArray(answers.percepcao) ? answers.percepcao : [];
  const estampasList = Array.isArray(answers.estampas) ? answers.estampas : answers.estampas ? [answers.estampas] : [];
  const coresList = Array.isArray(answers.cores) ? answers.cores : answers.cores ? [answers.cores] : [];
  const objetivoVal = answers.objetivo || '';

  if (prioridadeList.includes('Conforto') || tecidoList.includes('Macio e confortável')) scores.Esportivo += 2;
  if (prioridadeList.includes('Elegância') || guardaRoupaList.includes('Roupas elegantes e bem cortadas')) scores.Elegante += 2;
  if (percepcaoList.includes('Criativa') || estampasList.includes('Várias estampas misturadas')) scores.Criativo += 2;
  if (objetivoVal === 'Look para Trabalho' || coresList.includes('Cores neutras (preto, branco, cinza)')) scores.Clássico += 2;
  if (percepcaoList.includes('Marcante') || percepcaoList.includes('Confiante')) scores.Dramático += 2;

  const sortedStyles = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

  const biotypeGuide = {
    Oval: {
      title: 'Biotipo Oval',
      tip: 'Foque em decotes em V, tecidos fluídos e linhas verticais que alongam a silhueta, disfarçando o volume central.',
      clothing: 'Blazers alongados, vestidos envelope e calças pantalona.'
    },
    Ampulheta: {
      title: 'Biotipo Ampulheta',
      tip: 'O objetivo é valorizar a cintura marcada com peças que acompanhem as curvas naturais sem excesso de volume.',
      clothing: 'Vestidos acinturados, cintos marcantes e peças transpassadas.'
    },
    Retângulo: {
      title: 'Biotipo Retângulo',
      tip: 'Crie a ilusão de curvas definindo mais a cintura e adicionando volume nos ombros ou quadris.',
      clothing: 'Blusas com babados, saias evasê e cintos na cintura.'
    },
    Triângulo: {
      title: 'Biotipo Triângulo (Pêra)',
      tip: 'Valorize a parte superior do corpo, trazendo atenção para ombros e colo, equilibrando com partes inferiores retas.',
      clothing: 'Blusas estruturadas, decotes amplos e calças de corte reto.'
    }
  };

  const resolvedBiotype = biotype || 'Oval';

  return {
    aparencia: sortedStyles[0] || 'Elegante',
    comunicacao: sortedStyles[1] || 'Confiante',
    comportamento: sortedStyles[2] || 'Acessível',
    biotype: resolvedBiotype,
    guide: biotypeGuide[resolvedBiotype] || biotypeGuide.Oval
  };
}

// --- Vitrine Dinâmica com Filtro de Perfil de Compra e Links de Afiliado ---
const CATALOG_ITEMS = [
  {
    id: 1,
    desc: 'Blazer Alongado com Decote em V',
    price: 329.9,
    priceLabel: 'R$ 329,90',
    tier: 'Moderado',
    store: 'Zara',
    link: 'https://www.zara.com/br/?utm_source=ayanmo&utm_medium=affiliate',
    image: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600',
    biotypes: ['Oval', 'Retângulo', 'Triângulo', 'Ampulheta']
  },
  {
    id: 2,
    desc: 'Vestido Envelope Midi Fluído',
    price: 249.9,
    priceLabel: 'R$ 249,90',
    tier: 'Moderado',
    store: 'Amaro',
    link: 'https://amaro.com/br/pt/?utm_source=ayanmo&utm_medium=affiliate',
    image: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600',
    biotypes: ['Oval', 'Ampulheta', 'Retângulo']
  },
  {
    id: 3,
    desc: 'Vestido Acinturado Alfaiataria',
    price: 299.0,
    priceLabel: 'R$ 299,00',
    tier: 'Moderado',
    store: 'AMARO',
    link: 'https://amaro.com/br/pt/?utm_source=ayanmo&utm_medium=affiliate',
    image: 'https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600',
    biotypes: ['Ampulheta', 'Triângulo']
  },
  {
    id: 4,
    desc: 'Camisa Leve e Conjuntos do Dia a Dia',
    price: 159.9,
    priceLabel: 'R$ 159,90',
    tier: 'Econômico',
    store: 'Renner',
    link: 'https://www.lojasrenner.com.br/?utm_source=ayanmo&utm_medium=affiliate',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600',
    biotypes: ['Oval', 'Ampulheta', 'Retângulo', 'Triângulo']
  },
  {
    id: 5,
    desc: 'Conjunto Alfaiataria e Peças Selecionadas',
    price: 429.0,
    priceLabel: 'R$ 429,00',
    tier: 'Premium',
    store: 'Zara',
    link: 'https://www.zara.com/br/?utm_source=ayanmo&utm_medium=affiliate',
    image: 'https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600',
    biotypes: ['Oval', 'Ampulheta', 'Retângulo', 'Triângulo']
  }
];

function getDynamicRecommendations(biotype, buyingProfile = 'Moderado') {
  const maxByTier = {
    Econômico: 220,
    Moderado: 360,
    Premium: 99999
  };
  const maxPrice = maxByTier[buyingProfile] || 360;

  let filtered = CATALOG_ITEMS.filter((item) => item.price <= maxPrice);
  if (filtered.length === 0) filtered = [...CATALOG_ITEMS];

  const prioritized = [...filtered].sort((a, b) => {
    const aMatch = a.biotypes.includes(biotype) ? 1 : 0;
    const bMatch = b.biotypes.includes(biotype) ? 1 : 0;
    return bMatch - aMatch;
  });

  return prioritized.slice(0, 3);
}

// Perguntas originais do App-antes.js
// Regras: Ocasião (step 3) = 1 opção | Desejo de imagem (step 5) = até 2 opções | Demais = quantas quiser
const QUESTIONS_BY_STEP = {
  3: {
    key: 'objetivo',
    title: 'O que você procura hoje?',
    subtitle: 'Escolha 1 opção.',
    multi: false,
    max: 1,
    options: [
      'Look Casual',
      'Look Esportivo',
      'Look para Trabalho',
      'Look de Festa',
      'Moda Praia',
      'Look para Viagem',
      'Moda Íntima'
    ]
  },
  4: {
    key: 'prioridade',
    title: 'O que mais importa para você em uma roupa?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Conforto',
      'Elegância',
      'Delicadeza',
      'Sensualidade',
      'Impacto',
      'Discrição',
      'Criatividade'
    ]
  },
  5: {
    key: 'percepcao',
    title: 'Como você quer ser percebida com este look?',
    subtitle: 'Escolha até 2 opções.',
    multi: true,
    max: 2,
    options: ['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante']
  },
  6: {
    key: 'guardaRoupa',
    title: 'Do que você mais gosta no seu guarda-roupa?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Roupas confortáveis',
      'Roupas elegantes e bem cortadas',
      'Peças delicadas',
      'Itens básicos',
      'Peças marcantes'
    ]
  },
  7: {
    key: 'tecido',
    title: 'Qual tipo de tecido te atrai mais ao toque?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Macio e confortável',
      'Fino e sofisticado',
      'Leve e fluído',
      'Estruturado'
    ]
  },
  8: {
    key: 'cores',
    title: 'Como você prefere misturar as cores?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Cores intensas',
      'Tons pastéis',
      'Cores neutras (preto, branco, cinza)',
      'Cores contrastantes'
    ]
  },
  9: {
    key: 'estampas',
    title: 'Se fosse escolher uma estampa, qual seria?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Neutra sem estampa',
      'Estampa pequena',
      'Geométrica ou abstrata',
      'Floral delicado',
      'Várias estampas misturadas'
    ]
  }
};

export default function AyanmoApp() {
  const [user, setUser] = useState(null);
  // 0: Splash | 1: Acessibilidade | 2: Cadastro + Perfil de compra | 3..9: Quiz | 10: Biótipo/Câmera | 11: Resultado | 12: Vitrine
  const [step, setStep] = useState(0);
  const [accessibility, setAccessibility] = useState(true);
  const [biotypeDetected, setBiotypeDetected] = useState('Oval');
  const [bgProcessing, setBgProcessing] = useState(false);

  const [measurements, setMeasurements] = useState({
    shouldersCm: 96,
    waistCm: 74,
    hipsCm: 100
  });

  const videoRef = useRef(null);
  const { speak, stop } = useAudioDescription(accessibility);

  const [profile, setProfile] = useState({
    nome: '',
    email: '',
    telefone: '',
    aniversario: '',
    genero: '',
    perfilCompra: 'Moderado'
  });

  const [answers, setAnswers] = useState({
    objetivo: '',
    prioridade: [],
    percepcao: [],
    guardaRoupa: [],
    tecido: [],
    cores: [],
    estampas: []
  });

  const [calculatedResult, setCalculatedResult] = useState(null);

  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch((err) => console.error(err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Processamento de biótipo em background enquanto responde ao quiz
  useEffect(() => {
    if (step >= 3 && step <= 9) {
      setBgProcessing(true);
      const timer = setTimeout(() => {
        const biotypes = ['Oval', 'Ampulheta', 'Retângulo', 'Triângulo'];
        const picked = biotypes[Math.floor(Math.random() * biotypes.length)];
        const interpreted = interpretBiotype({
          ...measurements,
          fallbackBiotype: picked
        });
        setBiotypeDetected(interpreted);
        setBgProcessing(false);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [step, measurements]);

  // Audiodescrição inteligente por passo incluindo perguntas e opções
  const speakCurrentScreen = useCallback(
    (stepIndex) => {
      if (!accessibility) return;

      if (stepIndex === 0) {
        speak('Bem-vinda ao Ayanmo. Sua assistente de estilo acessível. Toque para iniciar.');
      } else if (stepIndex === 1) {
        speak('Você deseja ativar a audiodescrição e o leitor de tela acessível? Selecione Sim ou Não.');
      } else if (stepIndex === 2) {
        speak(
          'Por favor, preencha seus dados de cadastro e escolha seu perfil de compra: Econômico, Moderado ou Premium.'
        );
      } else if (stepIndex === 10) {
        speak('Análise de biotipo por câmera aberta. Posicione-se no centro da moldura.');
      } else if (stepIndex === 11) {
        speak(
          `Análise concluída. Biotipo identificado: ${calculatedResult?.biotype || biotypeDetected}. Estilo: ${
            calculatedResult?.aparencia || ''
          }. Veja abaixo as orientações de roupas.`
        );
      } else if (stepIndex === 12) {
        speak('Vitrine de recomendações de peças personalizadas.');
      } else if (QUESTIONS_BY_STEP[stepIndex]) {
        const q = QUESTIONS_BY_STEP[stepIndex];
        speak(`${q.title} ${q.subtitle} Opções disponíveis: ${q.options.join(', ')}.`);
      }
    },
    [speak, calculatedResult, biotypeDetected]
  );

  useEffect(() => {
    speakCurrentScreen(step);
  }, [step, speakCurrentScreen]);

  // Câmera na etapa 10
  useEffect(() => {
    let stream = null;
    if (step === 10) {
      navigator.mediaDevices
        ?.getUserMedia({ video: { facingMode: 'user' } })
        .then((s) => {
          stream = s;
          if (videoRef.current) videoRef.current.srcObject = s;
        })
        .catch((err) => console.warn('Câmera indisponível:', err));

      const timer = setTimeout(() => {
        const interpreted = interpretBiotype({
          ...measurements,
          fallbackBiotype: biotypeDetected
        });
        setBiotypeDetected(interpreted);
        const res = calculateStyleProfile(answers, interpreted);
        setCalculatedResult(res);
        saveToFirebase(res);
        setStep(11);
      }, 4500);

      return () => {
        clearTimeout(timer);
        if (stream) stream.getTracks().forEach((track) => track.stop());
      };
    }
  }, [step, measurements, biotypeDetected, answers]);

  const saveToFirebase = async (finalResult) => {
    if (!db || !user) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'ayanmo-default';
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'assessments'), {
        profile,
        measurements,
        answers,
        accessibility,
        calculatedResult: finalResult,
        createdAt: serverTimestamp()
      });
    } catch (e) {
      console.error('Erro ao salvar:', e);
    }
  };

  const nextStep = () => {
    stop();
    setStep((s) => {
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
    setStep((s) => Math.max(0, s - 1));
  };

  // Seleção:
  // - Ocasião (isMulti = false, max = 1): seleciona 1 opção e avança
  // - Desejo de imagem (isMulti = true, max = 2): até 2 opções
  // - Demais perguntas (isMulti = true, max = null): quantas quiser
  const handleOptionSelect = (key, value, isMulti = false, max = null) => {
    if (!isMulti) {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      speak(`Selecionado: ${value}`);
      setTimeout(nextStep, 400);
      return;
    }

    setAnswers((prev) => {
      const current = Array.isArray(prev[key]) ? [...prev[key]] : [];
      let updated;
      if (current.includes(value)) {
        updated = current.filter((v) => v !== value);
        speak(`Removido: ${value}`);
      } else if (max !== null && current.length >= max) {
        speak(`Você pode escolher no máximo ${max} opções.`);
        return prev;
      } else {
        updated = [...current, value];
        speak(`Selecionado: ${value}`);
      }
      return { ...prev, [key]: updated };
    });
  };

  const renderContent = () => {
    switch (step) {
      case 0:
        return (
          <div
            onClick={nextStep}
            tabIndex={0}
            role="button"
            className="flex flex-col items-center justify-center h-full p-8 text-center cursor-pointer focus:outline-none"
          >
            <div className="mb-8 border-4 border-[#4A3026] p-6 rotate-45">
              <div className="-rotate-45">
                <h1 className="text-4xl md:text-6xl font-bold text-[#4A3026] tracking-widest uppercase">
                  Ayanmo
                </h1>
              </div>
            </div>
            <p className="text-[#1A2733] text-lg font-light tracking-wide uppercase">
              Tecnologia Assistiva e Consultoria de Moda
            </p>
            <p className="mt-12 text-[#5C879C] animate-pulse font-medium">
              Toque ou pressione Enter para começar
            </p>
          </div>
        );

      case 1:
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
            <Volume2 size={56} className="text-[#4A3026] mb-6 animate-bounce" />
            <h2 className="text-2xl text-[#4A3026] mb-8 font-semibold">
              Ativar Audiodescrição e Leitor de Tela?
            </h2>
            <div className="flex flex-col gap-4 w-full">
              <button
                type="button"
                onClick={() => {
                  setAccessibility(true);
                  speak('Audiodescrição ativada.');
                  nextStep();
                }}
                className="py-5 bg-[#4A3026] text-[#F7F7F5] font-bold text-lg rounded shadow-md"
              >
                SIM (Ativar Leitor)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessibility(false);
                  stop();
                  nextStep();
                }}
                className="py-4 border-2 border-[#1A2733] text-[#1A2733] font-medium rounded"
              >
                NÃO (Padrão)
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="flex flex-col h-full p-6 max-w-md mx-auto justify-center overflow-y-auto">
            <h2 className="text-2xl text-[#4A3026] mb-6 font-semibold">Seus dados cadastrais</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (profile.nome) nextStep();
              }}
              className="space-y-4 pb-8"
            >
              <input
                type="text"
                required
                placeholder="Nome Completo"
                className="p-3 border border-gray-300 rounded w-full bg-white"
                value={profile.nome}
                onChange={(e) => setProfile({ ...profile, nome: e.target.value })}
              />
              <input
                type="email"
                required
                placeholder="E-mail"
                className="p-3 border border-gray-300 rounded w-full bg-white"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
              <input
                type="tel"
                placeholder="Telefone"
                className="p-3 border border-gray-300 rounded w-full bg-white"
                value={profile.telefone}
                onChange={(e) => setProfile({ ...profile, telefone: e.target.value })}
              />
              <input
                type="date"
                className="p-3 border border-gray-300 rounded w-full bg-white"
                value={profile.aniversario}
                onChange={(e) => setProfile({ ...profile, aniversario: e.target.value })}
              />
              <div className="flex space-x-2">
                {['Feminino', 'Masculino', 'Outro'].map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setProfile({ ...profile, genero: g })}
                    className={`flex-1 py-2 text-sm border rounded ${
                      profile.genero === g ? 'bg-[#4A3026] text-white' : 'border-gray-300 bg-white'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>

              <div>
                <p className="text-xs font-bold uppercase text-[#5C879C] mb-1">
                  Perfil de Compra (Filtro de Preço)
                </p>
                <div className="flex space-x-2">
                  {['Econômico', 'Moderado', 'Premium'].map((tier) => (
                    <button
                      type="button"
                      key={tier}
                      onClick={() => {
                        setProfile({ ...profile, perfilCompra: tier });
                        speak(`Perfil de compra ${tier} selecionado.`);
                      }}
                      className={`flex-1 py-2 text-xs border rounded font-medium ${
                        profile.perfilCompra === tier
                          ? 'bg-[#1A2733] text-white border-[#1A2733]'
                          : 'border-gray-300 bg-white text-[#1A2733]'
                      }`}
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full mt-4 bg-[#1A2733] text-[#F7F7F5] py-4 uppercase font-bold rounded"
              >
                Continuar
              </button>
            </form>
          </div>
        );

      case 10:
        return (
          <div className="flex flex-col items-center justify-center h-full p-4 bg-[#1A2733] text-[#F7F7F5] text-center overflow-y-auto">
            <h2 className="text-xl mb-3 font-light">
              Análise Morfológica: Posicione-se para leitura de biotipo.
            </h2>
            <div className="relative w-64 h-72 border-2 border-[#5C879C] rounded-3xl overflow-hidden mb-4 flex items-center justify-center">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute w-48 h-60 border-4 border-dashed border-amber-400 rounded-[50%] flex items-center justify-center animate-pulse">
                <span className="bg-[#1A2733]/80 text-amber-300 px-3 py-1 text-xs rounded-full font-bold">
                  {biotypeDetected.toUpperCase()}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 max-w-xs w-full mb-3 text-xs text-[#1A2733]">
              <label className="bg-[#F7F7F5] p-1.5 rounded">
                <span className="block font-bold">Ombros (cm)</span>
                <input
                  type="number"
                  value={measurements.shouldersCm}
                  onChange={(e) =>
                    setMeasurements({ ...measurements, shouldersCm: Number(e.target.value) })
                  }
                  className="w-full text-center bg-transparent font-semibold"
                />
              </label>
              <label className="bg-[#F7F7F5] p-1.5 rounded">
                <span className="block font-bold">Cintura (cm)</span>
                <input
                  type="number"
                  value={measurements.waistCm}
                  onChange={(e) =>
                    setMeasurements({ ...measurements, waistCm: Number(e.target.value) })
                  }
                  className="w-full text-center bg-transparent font-semibold"
                />
              </label>
              <label className="bg-[#F7F7F5] p-1.5 rounded">
                <span className="block font-bold">Quadril (cm)</span>
                <input
                  type="number"
                  value={measurements.hipsCm}
                  onChange={(e) =>
                    setMeasurements({ ...measurements, hipsCm: Number(e.target.value) })
                  }
                  className="w-full text-center bg-transparent font-semibold"
                />
              </label>
            </div>
            <p className="text-amber-300 font-medium animate-pulse text-sm flex items-center gap-1">
              <Ruler size={14} />
              <span>Processando proporções ({biotypeDetected})...</span>
            </p>
          </div>
        );

      case 11:
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
                <span className="text-xs font-bold text-amber-800 uppercase block mb-1">
                  Dica de Caimento:
                </span>
                <p className="text-xs text-gray-700">{calculatedResult?.guide.tip}</p>
              </div>
              <div>
                <span className="text-xs text-[#5C879C] font-bold uppercase">
                  Sugestões de Roupas Ideais
                </span>
                <p className="text-sm font-semibold text-[#1A2733]">
                  {calculatedResult?.guide.clothing}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={nextStep}
              className="w-full bg-[#4A3026] text-[#F7F7F5] py-4 uppercase font-bold rounded hover:bg-[#1A2733]"
            >
              Ver Vitrine de Produtos
            </button>
          </div>
        );

      case 12: {
        const items = getDynamicRecommendations(
          calculatedResult?.biotype || biotypeDetected,
          profile.perfilCompra
        );
        return (
          <div className="flex flex-col h-full bg-[#F7F7F5] overflow-y-auto pb-12 p-6 pt-16">
            <div className="mb-6 p-4 bg-[#1A2733] text-[#F7F7F5] rounded-lg">
              <h2 className="text-xl font-bold mb-1">
                Vitrine para {calculatedResult?.guide.title || biotypeDetected}
              </h2>
              <p className="text-xs text-[#5C879C]">
                Perfil de compra: {profile.perfilCompra} · Estilo: {calculatedResult?.aparencia}
              </p>
            </div>
            <div className="space-y-6 max-w-md mx-auto w-full">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden p-4 flex flex-col gap-2"
                >
                  <img
                    src={item.image}
                    alt={item.desc}
                    className="w-full h-48 object-cover rounded"
                  />
                  <span className="text-xs text-[#5C879C] font-bold uppercase">{item.store}</span>
                  <h3 className="font-bold text-[#1A2733]">{item.desc}</h3>
                  <div className="flex justify-between items-center mt-2">
                    <span className="font-bold text-[#4A3026]">{item.priceLabel}</span>
                    <button
                      type="button"
                      onClick={() => window.open(item.link, '_blank', 'noopener,noreferrer')}
                      className="px-4 py-2 bg-[#4A3026] text-white rounded text-sm font-bold flex items-center space-x-1"
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

      default: {
        const q = QUESTIONS_BY_STEP[step];
        if (!q) return null;

        const selectedList = Array.isArray(answers[q.key]) ? answers[q.key] : [];
        const hasSelection = q.multi ? selectedList.length > 0 : Boolean(answers[q.key]);

        return (
          <div className="flex flex-col h-full p-6 pt-16 max-w-md mx-auto w-full justify-center overflow-y-auto">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs text-[#5C879C] font-medium">{q.subtitle}</p>
              {bgProcessing && (
                <span className="text-[11px] text-[#4A3026] flex items-center gap-1">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Analisando biótipo...</span>
                </span>
              )}
            </div>
            <h2 className="text-xl md:text-2xl font-bold text-[#4A3026] mb-6">{q.title}</h2>
            <div className="space-y-3">
              {q.options.map((opt) => {
                const isSelected = q.multi
                  ? selectedList.includes(opt)
                  : answers[q.key] === opt;

                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() => handleOptionSelect(q.key, opt, q.multi, q.max)}
                    className={`w-full text-left p-4 rounded border transition-all flex justify-between items-center ${
                      isSelected ? 'bg-[#4A3026] text-white' : 'bg-white'
                    }`}
                  >
                    <span>{opt}</span>
                    {isSelected && <Check size={20} />}
                  </button>
                );
              })}
            </div>

            {q.multi && (
              <button
                type="button"
                onClick={nextStep}
                disabled={!hasSelection}
                className={`w-full mt-6 py-4 uppercase font-bold rounded ${
                  hasSelection
                    ? 'bg-[#1A2733] text-[#F7F7F5]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Avançar
              </button>
            )}
          </div>
        );
      }
    }
  };

  return (
    <div className="h-screen w-full bg-[#F7F7F5] relative overflow-hidden">
      {step > 0 && (
        <div className="absolute top-4 left-4 right-4 z-50 flex justify-between items-center">
          <button
            type="button"
            onClick={prevStep}
            className="p-2 bg-white rounded-full shadow text-[#1A2733]"
            aria-label="Voltar"
          >
            <ChevronLeft size={24} />
          </button>
          {accessibility && (
            <button
              type="button"
              onClick={() => speakCurrentScreen(step)}
              className="px-3 py-1 bg-[#5C879C] text-white text-xs font-bold rounded-full shadow flex items-center space-x-1"
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
