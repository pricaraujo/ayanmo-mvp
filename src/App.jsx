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
  console.log('Firebase init skipped or failed (running in mock mode):', e);
}

// --- Hook de Audiodescrição / Leitor de Tela ---
function useAudioDescription(enabled = true) {
  const speak = useCallback(
    (text) => {
      if (!enabled || !('speechSynthesis' in window) || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'pt-BR';
      utterance.rate = 0.96;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    [enabled]
  );

  const stop = useCallback(() => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  return { speak, stop };
}

// --- Lógica de Visão Computacional / Medidas Simétricas por Biótipo ---
// Avalia simetria entre ombros/busto, cintura e quadril (em cm ou proporção normalizada)
function classifyBiotypeFromMeasurements({ shouldersCm, waistCm, hipsCm, symmetryScore = 0.95 }) {
  const s = Number(shouldersCm) || 96;
  const w = Number(waistCm) || 74;
  const h = Number(hipsCm) || 100;

  const diffSH = Math.abs(s - h); // diferença ombro vs quadril
  const waistToHip = w / Math.max(h, 1);
  const waistToShoulder = w / Math.max(s, 1);

  let biotype = 'Ampulheta';
  let rationale =
    'Proporções equilibradas entre ombros e quadril com cintura definida, favorecendo cortes que acompanham a linha natural sem rigidez excessiva.';

  if (h - s >= 6 && waistToHip > 0.72) {
    biotype = 'Pêra (Triângulo)';
    rationale =
      'Quadril mais largo que os ombros; a consultoria de estilo favorece pontos de luz, estrutura ou decotes na parte superior e caimento fluido na parte inferior.';
  } else if (s - h >= 6 && waistToShoulder > 0.72) {
    biotype = 'Triângulo Invertido';
    rationale =
      'Ombros/tórax mais amplos que o quadril; recomenda-se suavizar a linha dos ombros e trazer volume ou movimento equilibrado para a região inferior.';
  } else if (diffSH <= 5 && waistToHip >= 0.82 && waistToShoulder >= 0.82) {
    biotype = 'Retângulo';
    rationale =
      'Medidas simétricas e lineares entre ombros, cintura e quadril; cortes transpassados, cintos estratégicos ou texturas ajudam a criar contorno.';
  } else if (waistToHip >= 0.88 && waistToShoulder >= 0.88) {
    biotype = 'Oval';
    rationale =
      'Concentração central de volume; linhas verticais, decotes em V e tecidos leves/fluidos alongam a silhueta com conforto e liberdade de movimento.';
  } else {
    biotype = 'Ampulheta';
    rationale =
      'Harmonia simétrica entre ombros e quadril com cintura marcada; valoriza peças com bom caimento que respeitam as proporções naturais.';
  }

  return {
    biotype,
    rationale,
    symmetryIndex: Number(symmetryScore.toFixed(2)),
    measurements: { shouldersCm: s, waistCm: w, hipsCm: h }
  };
}

// --- Motor de Estilo (Groundtruth ISA + AYANMO) ---
function calculateStyleProfile(answers, biotypeData) {
  const styleScores = {
    Clássico: 0,
    Elegante: 0,
    Esportivo: 0,
    Criativo: 0,
    Dramático: 0,
    Romântico: 0,
    Natural: 0
  };

  const priorities = answers.prioridade || [];
  const perceptions = answers.percepcao || []; // Desejo de imagem (até 2)
  const fabrics = answers.tecido || [];
  const colors = answers.cores || [];
  const prints = answers.estampas || [];
  const wardrobe = answers.guardaRoupa || [];
  const occasion = answers.ocasiao || '';

  // Prioridades ("O que mais importa pra você numa roupa?")
  if (priorities.includes('Conforto')) {
    styleScores.Natural += 2;
    styleScores.Esportivo += 2;
  }
  if (priorities.includes('Elegância')) {
    styleScores.Elegante += 3;
    styleScores.Clássico += 1;
  }
  if (priorities.includes('Delicadeza')) {
    styleScores.Romântico += 3;
  }
  if (priorities.includes('Sensualidade')) {
    styleScores.Dramático += 2;
    styleScores.Elegante += 1;
  }
  if (priorities.includes('Impacto')) {
    styleScores.Dramático += 3;
    styleScores.Criativo += 1;
  }
  if (priorities.includes('Discrição')) {
    styleScores.Clássico += 2;
    styleScores.Natural += 1;
  }
  if (priorities.includes('Criatividade')) {
    styleScores.Criativo += 3;
  }

  // Desejo de imagem (até 2)
  perceptions.forEach((p) => {
    if (p === 'Profissional') styleScores.Clássico += 2;
    if (p === 'Confiante') styleScores.Elegante += 2;
    if (p === 'Acessível') styleScores.Natural += 2;
    if (p === 'Criativa') styleScores.Criativo += 2;
    if (p === 'Elegante') styleScores.Elegante += 2;
    if (p === 'Marcante') styleScores.Dramático += 2;
  });

  // Tecidos, cores, estampas e guarda-roupa
  if (fabrics.some((t) => t.includes('Macio') || t.includes('Leve') || t.includes('Neutro'))) {
    styleScores.Natural += 1;
  }
  if (fabrics.some((t) => t.includes('Fino') || t.includes('Estruturado'))) {
    styleScores.Elegante += 1;
    styleScores.Clássico += 1;
  }
  if (fabrics.some((t) => t.includes('Justo') || t.includes('Colorido'))) {
    styleScores.Dramático += 1;
    styleScores.Criativo += 1;
  }

  if (colors.some((c) => c.includes('Neutras') || c.includes('mesmas'))) styleScores.Clássico += 1;
  if (colors.some((c) => c.includes('Contrastantes') || c.includes('tendências'))) styleScores.Criativo += 1;
  if (colors.some((c) => c.includes('Suaves') || c.includes('parecidos'))) styleScores.Romântico += 1;

  if (prints.some((e) => e.includes('Floral') || e.includes('Pequena'))) styleScores.Romântico += 1;
  if (prints.some((e) => e.includes('Geométrica') || e.includes('Misturada'))) styleScores.Criativo += 1;
  if (prints.some((e) => e.includes('Listrada') || e.includes('Neutra'))) styleScores.Clássico += 1;
  if (prints.some((e) => e.includes('Animal'))) styleScores.Dramático += 1;

  if (wardrobe.some((w) => w.includes('confortáveis'))) styleScores.Esportivo += 1;
  if (wardrobe.some((w) => w.includes('bem cortadas'))) styleScores.Elegante += 1;
  if (wardrobe.some((w) => w.includes('delicadas'))) styleScores.Romântico += 1;
  if (wardrobe.some((w) => w.includes('criativas'))) styleScores.Criativo += 1;

  const ranked = Object.entries(styleScores).sort((a, b) => b[1] - a[1]);
  const primaryStyle = ranked[0]?.[0] || 'Elegante';
  const secondaryStyle = ranked[1]?.[0] || 'Clássico';

  return {
    primaryStyle,
    secondaryStyle,
    occasion,
    biotype: biotypeData.biotype,
    biotypeRationale: biotypeData.rationale,
    measurements: biotypeData.measurements
  };
}

// --- Catálogo com Filtro por Perfil de Compra + Links de Afiliado ---
const AFFILIATE_CATALOG = [
  {
    id: 'prod-1',
    brand: 'Renner',
    name: 'Camisa Alfaiataria Manga Longa com Caimento Fluido',
    price: 179.9,
    priceTier: 'Econômico',
    occasions: ['Trabalho', 'Reunião / Evento', 'Casual'],
    styles: ['Clássico', 'Elegante', 'Natural'],
    biotypes: ['Ampulheta', 'Pêra (Triângulo)', 'Retângulo', 'Oval', 'Triângulo Invertido'],
    audioDescription:
      'Camisa de alfaiataria em tecido leve de toque macio, modelagem reta com caimento fluido, botões frontais e punhos estruturados. Ideal para compor visuais alinhados sem restringir movimentos.',
    consultingNote: 'Equilibra formalidade e conforto tátil para ocasiões profissionais e do dia a dia.',
    affiliateUrl: 'https://www.lojasrenner.com.br/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  },
  {
    id: 'prod-2',
    brand: 'C&A',
    name: 'Calça Pantalona Cintura Alta em Viscose',
    price: 159.9,
    priceTier: 'Econômico',
    occasions: ['Trabalho', 'Casual', 'Viagem'],
    styles: ['Elegante', 'Natural', 'Clássico'],
    biotypes: ['Ampulheta', 'Oval', 'Triângulo Invertido', 'Retângulo'],
    audioDescription:
      'Calça pantalona de cintura alta com cós anatômico e pernas amplas de movimento contínuo. O tecido tem toque fresco e alonga a linha vertical.',
    consultingNote: 'Alongamento visual e conforto contínuo para rotinas longas ou viagens.',
    affiliateUrl: 'https://www.cea.com.br/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  },
  {
    id: 'prod-3',
    brand: 'AMARO',
    name: 'Vestido Transpassado Midi em Malha Estruturada',
    price: 269.9,
    priceTier: 'Moderado',
    occasions: ['Festa / Jantar', 'Trabalho', 'Encontro'],
    styles: ['Elegante', 'Romântico', 'Dramático'],
    biotypes: ['Ampulheta', 'Oval', 'Retângulo', 'Pêra (Triângulo)'],
    audioDescription:
      'Vestido midi com decote transpassado em V e faixa ajustável na cintura. Malha encorpada de toque suave que modela com equilíbrio sem apertar.',
    consultingNote: 'Decote em V e cintura ajustável valorizam proporções e trazem presença elegante.',
    affiliateUrl: 'https://amaro.com/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  },
  {
    id: 'prod-4',
    brand: 'Farm Rio',
    name: 'Blusa Cropped/Cintura Média com Estampa Botânica Leve',
    price: 298.0,
    priceTier: 'Moderado',
    occasions: ['Passeio / Dia', 'Viagem', 'Festa / Jantar'],
    styles: ['Criativo', 'Romântico', 'Natural'],
    biotypes: ['Pêra (Triângulo)', 'Ampulheta', 'Retângulo'],
    audioDescription:
      'Blusa leve em tecido respirável com estampa orgânica de folhas e flores em contraste harmônico, mangas amplas e acabamento delicado.',
    consultingNote: 'Traz expressividade criativa e leveza sensorial para dias ensolarados ou encontros.',
    affiliateUrl: 'https://www.farmrio.com.br/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  },
  {
    id: 'prod-5',
    brand: 'Zara',
    name: 'Blazer Alongado Estruturado em Mistura de Viscose',
    price: 459.0,
    priceTier: 'Premium',
    occasions: ['Trabalho', 'Festa / Jantar', 'Reunião / Evento'],
    styles: ['Elegante', 'Dramático', 'Clássico'],
    biotypes: ['Oval', 'Pêra (Triângulo)', 'Retângulo', 'Ampulheta'],
    audioDescription:
      'Blazer de comprimento alongado com lapela clássica, ombreiras suaves e forro macio. Cria linha vertical marcante e acabamento sofisticado.',
    consultingNote: 'Peça-chave de impacto e sofisticação que estrutura a silhueta com clareza.',
    affiliateUrl: 'https://www.zara.com/br/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  },
  {
    id: 'prod-6',
    brand: 'Track&Field',
    name: 'Conjunto Esportivo Sem Costura de Alta Respirabilidade',
    price: 389.0,
    priceTier: 'Premium',
    occasions: ['Esportivo / Ativo', 'Viagem', 'Casual'],
    styles: ['Esportivo', 'Natural'],
    biotypes: ['Ampulheta', 'Retângulo', 'Triângulo Invertido', 'Pêra (Triângulo)', 'Oval'],
    audioDescription:
      'Conjunto esportivo em malha tecnológica sem costuras laterais irritantes, elasticidade uniforme e toque macio que acompanha o movimento.',
    consultingNote: 'Prioriza sensorialidade tátil, zero atrito e mobilidade total.',
    affiliateUrl: 'https://www.tf.com.br/?utm_source=ayanmo_affiliate&utm_medium=app&utm_campaign=mvp_launch'
  }
];

function filterCatalogByUser(profile, answers, styleSummary) {
  const tier = profile.buyingProfile || 'Moderado';
  const maxPriceMap = {
    Econômico: 220,
    Moderado: 350,
    Premium: 9999
  };
  const maxPrice = maxPriceMap[tier] || 350;

  // Filtra inicialmente pelo perfil de compra; se ficar vazio, amplia suavemente
  let matches = AFFILIATE_CATALOG.filter((item) => item.price <= maxPrice);
  if (matches.length === 0) matches = [...AFFILIATE_CATALOG];

  // Pontua aderência a biotipo, estilo e ocasião
  const scored = matches
    .map((item) => {
      let score = 0;
      if (item.biotypes.includes(styleSummary.biotype)) score += 3;
      if (
        item.styles.includes(styleSummary.primaryStyle) ||
        item.styles.includes(styleSummary.secondaryStyle)
      ) {
        score += 3;
      }
      if (styleSummary.occasion && item.occasions.includes(styleSummary.occasion)) {
        score += 2;
      }
      return { ...item, score };
    })
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 4);
}

// --- Definição das Perguntas do Quiz ---
// Regras: Ocasião = máx 1 | Desejo de imagem = máx 2 | Demais = quantas quiser (multi = true, max = null)
const QUIZ_STEPS = [
  {
    step: 4,
    key: 'ocasiao',
    title: 'Qual é a ocasião principal para este look?',
    subtitle: 'Escolha 1 opção.',
    multi: false,
    max: 1,
    options: ['Trabalho', 'Casual', 'Festa / Jantar', 'Esportivo / Ativo', 'Viagem', 'Passeio / Dia']
  },
  {
    step: 5,
    key: 'percepcao',
    title: 'Qual é o seu desejo de imagem com este look?',
    subtitle: 'Escolha até 2 opções.',
    multi: true,
    max: 2,
    options: ['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante']
  },
  {
    step: 6,
    key: 'prioridade',
    title: 'O que mais importa pra você numa roupa?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: ['Conforto', 'Elegância', 'Delicadeza', 'Sensualidade', 'Impacto', 'Discrição', 'Criatividade']
  },
  {
    step: 7,
    key: 'tecido',
    title: 'Qual tipo de tecido te atrai mais ao toque?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Macio e confortável',
      'Fino e sofisticado',
      'Leve e fluido',
      'Justo e elástico',
      'Estruturado com forma firme',
      'Neutro e simples',
      'Colorido ou diferente'
    ]
  },
  {
    step: 8,
    key: 'cores',
    title: 'Como você mistura as cores nas suas roupas?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Neutras (preto, branco, cinza, bege)',
      'Tudo combinando',
      'Tons parecidos (monocromático)',
      'Suaves / pastéis',
      'Contrastantes',
      'Cores das tendências',
      'Uso sempre as mesmas cores'
    ]
  },
  {
    step: 9,
    key: 'estampas',
    title: 'Se fosse escolher uma estampa, qual seria?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Neutra / sem estampa',
      'Estampa pequena e discreta',
      'Geométrica ou abstrata',
      'Estampas misturadas',
      'Listrada ou xadrez',
      'Floral',
      'Animal print'
    ]
  },
  {
    step: 10,
    key: 'guardaRoupa',
    title: 'Do que você mais gosta no seu guarda-roupa?',
    subtitle: 'Escolha quantas quiser.',
    multi: true,
    max: null,
    options: [
      'Roupas confortáveis',
      'Roupas elegantes e bem cortadas',
      'Peças delicadas',
      'Roupas que valorizam o corpo',
      'Peças marcantes',
      'Itens básicos e fáceis de combinar',
      'Peças criativas e únicas'
    ]
  }
];

export default function AyanmoApp() {
  const [user, setUser] = useState(null);
  // 0: Splash | 1: Acessibilidade | 2: Cadastro + Perfil de Compra | 3: Câmera & Medidas (início)
  // 4..10: Quiz (processa visão computacional em background) | 11: Resultado Biótipo & Estilo | 12: Vitrine Afiliados
  const [step, setStep] = useState(0);
  const [accessibility, setAccessibility] = useState(true);

  const [profile, setProfile] = useState({
    nome: '',
    email: '',
    telefone: '',
    aniversario: '',
    genero: '',
    buyingProfile: 'Moderado'
  });

  const [measurements, setMeasurements] = useState({
    shouldersCm: 96,
    waistCm: 74,
    hipsCm: 100
  });

  const [biotypeResult, setBiotypeResult] = useState(null);
  const [bgProcessing, setBgProcessing] = useState(false);

  const [answers, setAnswers] = useState({
    ocasiao: '',
    percepcao: [],
    prioridade: [],
    tecido: [],
    cores: [],
    estampas: [],
    guardaRoupa: []
  });

  const [finalAnalysis, setFinalAnalysis] = useState(null);
  const [recommendations, setRecommendations] = useState([]);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const { speak, stop } = useAudioDescription(accessibility);

  // Autenticação anônima no Firebase
  useEffect(() => {
    if (!auth) return;
    signInAnonymously(auth).catch((err) => console.error('Firebase auth error:', err));
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Fontes Google
  useEffect(() => {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Poppins:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // Controle de câmera na etapa 3 (início)
  useEffect(() => {
    let active = true;
    if (step === 3 && navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: 'user' }, audio: false })
        .then((stream) => {
          if (!active) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch(() => {
          // Segue sem câmera sem bloquear a experiência
        });
    } else if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [step]);

  // Leitura em voz alta completa da tela atual (incluindo perguntas, opções e resultados)
  const speakCurrentScreen = useCallback(
    (targetStep) => {
      if (!accessibility) return;

      if (targetStep === 0) {
        speak(
          'Ayanmo, consultoria de estilo e tecnologia assistiva. Toque na tela para começar.'
        );
        return;
      }

      if (targetStep === 1) {
        speak(
          'Você precisa de audiodescrição e leitura de tela em voz alta? Escolha Sim ou Não.'
        );
        return;
      }

      if (targetStep === 2) {
        speak(
          'Cadastro e perfil de compra. Preencha nome, e-mail, telefone, aniversário, gênero e escolha seu perfil de compra: Econômico, Moderado ou Premium.'
        );
        return;
      }

      if (targetStep === 3) {
        speak(
          'Leitura inicial de biotipo e medidas simétricas. Ajuste suas medidas de ombros, cintura e quadril ou use a câmera, e toque em Iniciar análise em segundo plano para responder ao quiz.'
        );
        return;
      }

      const quizItem = QUIZ_STEPS.find((q) => q.step === targetStep);
      if (quizItem) {
        const currentVal = answers[quizItem.key];
        const selectedText = quizItem.multi
          ? currentVal?.length
            ? ` Selecionados: ${currentVal.join(', ')}.`
            : ''
          : currentVal
          ? ` Selecionado: ${currentVal}.`
          : '';
        speak(
          `${quizItem.title} ${quizItem.subtitle} Opções: ${quizItem.options.join(', ')}.${selectedText}`
        );
        return;
      }

      if (targetStep === 11 && finalAnalysis) {
        speak(
          `Resultado da análise: Biótipo ${finalAnalysis.biotype}. ${finalAnalysis.biotypeRationale} Estilo principal: ${finalAnalysis.primaryStyle}, estilo complementar: ${finalAnalysis.secondaryStyle}. Toque em Ver vitrine de recomendações.`
        );
        return;
      }

      if (targetStep === 12) {
        const summaryItems = recommendations
          .map(
            (item, idx) =>
              `Opção ${idx + 1}: ${item.name}, marca ${item.brand}, preço ${item.price.toFixed(
                2
              ).replace('.', ',')} reais. ${item.audioDescription}`
          )
          .join(' ');
        speak(`Vitrine personalizada para seu perfil e perfil de compra. ${summaryItems}`);
      }
    },
    [accessibility, answers, finalAnalysis, recommendations, speak]
  );

  useEffect(() => {
    speakCurrentScreen(step);
  }, [step, speakCurrentScreen]);

  // Dispara leitura de biotipo e inicia processamento em background ao sair da etapa 3
  const startBackgroundBiotypeAnalysis = () => {
    setBgProcessing(true);
    const computed = classifyBiotypeFromMeasurements({
      ...measurements,
      symmetryScore: 0.94
    });
    setBiotypeResult(computed);

    // Simula processamento assíncrono em segundo plano enquanto o usuário responde ao quiz
    setTimeout(() => {
      setBgProcessing(false);
    }, 1500);
  };

  const persistAssessment = async (analysisObj, recs) => {
    if (!db || !user) return;
    try {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'ayanmo-default';
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'assessments'), {
        profile,
        measurements,
        accessibility,
        answers,
        analysis: analysisObj,
        recommendedIds: recs.map((r) => r.id),
        createdAt: serverTimestamp()
      });
    } catch (err) {
      console.error('Erro ao salvar avaliação no Firebase:', err);
    }
  };

  const finalizeQuizAndBuildRecommendations = () => {
    const bioData =
      biotypeResult || classifyBiotypeFromMeasurements({ ...measurements, symmetryScore: 0.94 });
    const styleSummary = calculateStyleProfile(answers, bioData);
    const filteredRecs = filterCatalogByUser(profile, answers, styleSummary);

    setFinalAnalysis(styleSummary);
    setRecommendations(filteredRecs);
    persistAssessment(styleSummary, filteredRecs);
    setStep(11);
  };

  const handleNext = () => {
    stop();
    if (step === 3) {
      startBackgroundBiotypeAnalysis();
      setStep(4);
      return;
    }
    if (step === 10) {
      finalizeQuizAndBuildRecommendations();
      return;
    }
    setStep((prev) => Math.min(12, prev + 1));
  };

  const handleBack = () => {
    stop();
    setStep((prev) => Math.max(0, prev - 1));
  };

  const handleSelectOption = (key, value, isMulti, max) => {
    if (!isMulti) {
      setAnswers((prev) => ({ ...prev, [key]: value }));
      speak(`Selecionado: ${value}.`);
      return;
    }

    setAnswers((prev) => {
      const current = Array.isArray(prev[key]) ? [...prev[key]] : [];
      const exists = current.includes(value);
      let updated;

      if (exists) {
        updated = current.filter((item) => item !== value);
        speak(`Removido: ${value}.`);
      } else if (max && current.length >= max) {
        speak(`Limite de ${max} opções atingido para esta pergunta.`);
        return prev;
      } else {
        updated = [...current, value];
        speak(`Selecionado: ${value}.`);
      }

      return { ...prev, [key]: updated };
    });
  };

  const renderScreen = () => {
    // 0: Splash
    if (step === 0) {
      return (
        <div
          onClick={handleNext}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && handleNext()}
          className="flex flex-col items-center justify-center h-full p-8 text-center cursor-pointer"
        >
          <div className="mb-8 border-4 border-[#4A3026] p-6 rotate-45">
            <div className="-rotate-45">
              <h1
                className="text-4xl md:text-6xl font-bold text-[#4A3026] tracking-widest uppercase"
                style={{ fontFamily: "'Poppins', sans-serif" }}
              >
                Ayanmo
              </h1>
            </div>
          </div>
          <p className="text-[#1A2733] text-lg font-light tracking-wide uppercase">
            Consultoria de Estilo &amp; Tecnologia Assistiva
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleNext();
            }}
            className="mt-14 px-6 py-3 bg-[#1A2733] text-[#F7F7F5] rounded flex items-center gap-2 font-medium"
          >
            <span>Começar</span>
            <ArrowRight size={18} />
          </button>
        </div>
      );
    }

    // 1: Acessibilidade logo no início
    if (step === 1) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
          <Volume2 size={52} className="text-[#4A3026] mb-6" />
          <h2
            className="text-2xl text-[#4A3026] mb-8 font-semibold"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Você precisa de audiodescrição e leitura de tela?
          </h2>
          <div className="flex flex-col gap-4 w-full">
            <button
              type="button"
              onClick={() => {
                setAccessibility(true);
                speak('Audiodescrição ativada.');
                setStep(2);
              }}
              className="w-full py-4 bg-[#4A3026] text-[#F7F7F5] font-semibold rounded"
            >
              Sim, ativar leitura em voz alta
            </button>
            <button
              type="button"
              onClick={() => {
                setAccessibility(false);
                stop();
                setStep(2);
              }}
              className="w-full py-4 border-2 border-[#1A2733] text-[#1A2733] font-semibold rounded"
            >
              Não
            </button>
          </div>
        </div>
      );
    }

    // 2: Cadastro + Perfil de Compra
    if (step === 2) {
      return (
        <div className="flex flex-col h-full p-6 pt-16 max-w-md mx-auto justify-center overflow-y-auto">
          <h2
            className="text-2xl text-[#4A3026] mb-6 font-semibold"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            Seus dados e perfil de compra
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!profile.nome.trim()) return;
              handleNext();
            }}
            className="space-y-4 pb-8"
          >
            <div>
              <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                Nome *
              </label>
              <input
                type="text"
                required
                placeholder="Seu nome"
                className="w-full p-3 bg-white border border-gray-300 rounded text-[#1A2733]"
                value={profile.nome}
                onChange={(e) => setProfile({ ...profile, nome: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                E-mail
              </label>
              <input
                type="email"
                placeholder="voce@exemplo.com"
                className="w-full p-3 bg-white border border-gray-300 rounded text-[#1A2733]"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  placeholder="(00) 00000-0000"
                  className="w-full p-3 bg-white border border-gray-300 rounded text-[#1A2733]"
                  value={profile.telefone}
                  onChange={(e) => setProfile({ ...profile, telefone: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                  Aniversário
                </label>
                <input
                  type="date"
                  className="w-full p-3 bg-white border border-gray-300 rounded text-[#1A2733]"
                  value={profile.aniversario}
                  onChange={(e) => setProfile({ ...profile, aniversario: e.target.value })}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                Gênero
              </label>
              <div className="flex gap-2">
                {['Feminino', 'Masculino', 'Não-binário', 'Outro'].map((g) => (
                  <button
                    type="button"
                    key={g}
                    onClick={() => setProfile({ ...profile, genero: g })}
                    className={`flex-1 py-2 px-2 text-xs border rounded ${
                      profile.genero === g
                        ? 'bg-[#4A3026] text-white border-[#4A3026]'
                        : 'bg-white text-[#1A2733] border-gray-300'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[#5C879C] mb-1">
                Perfil de Compra (filtro de preço no catálogo)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'Econômico', hint: 'Até R$ 220' },
                  { id: 'Moderado', hint: 'Até R$ 350' },
                  { id: 'Premium', hint: 'Acima / Completo' }
                ].map((tier) => (
                  <button
                    type="button"
                    key={tier.id}
                    onClick={() => {
                      setProfile({ ...profile, buyingProfile: tier.id });
                      speak(`Perfil de compra ${tier.id}, ${tier.hint}.`);
                    }}
                    className={`p-2 text-left border rounded ${
                      profile.buyingProfile === tier.id
                        ? 'bg-[#1A2733] text-white border-[#1A2733]'
                        : 'bg-white text-[#1A2733] border-gray-300'
                    }`}
                  >
                    <div className="text-xs font-bold">{tier.id}</div>
                    <div className="text-[11px] opacity-80">{tier.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full mt-4 bg-[#1A2733] text-[#F7F7F5] py-4 uppercase tracking-widest text-sm font-semibold rounded hover:bg-[#4A3026]"
            >
              Continuar para Biótipo
            </button>
          </form>
        </div>
      );
    }

    // 3: Captura inicial + Medidas Simétricas (roda em background durante o quiz)
    if (step === 3) {
      return (
        <div className="flex flex-col h-full p-6 pt-16 max-w-md mx-auto justify-center overflow-y-auto">
          <div className="flex items-center gap-2 text-[#4A3026] mb-2">
            <Ruler size={22} />
            <h2
              className="text-xl font-semibold"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Biótipo e Medidas Simétricas
            </h2>
          </div>
          <p className="text-xs text-[#5C879C] mb-4">
            A câmera captura sua silhueta inicial e o processamento roda em segundo plano enquanto você responde ao quiz.
          </p>

          <div className="relative w-full h-44 bg-[#1A2733] rounded-lg overflow-hidden mb-4 flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="w-28 h-36 border-2 border-dashed border-amber-300 rounded-[50%] flex items-center justify-center">
                <Camera className="text-amber-300" size={24} />
              </div>
              <span className="mt-1 text-[11px] bg-[#1A2733]/80 text-amber-200 px-2 py-0.5 rounded">
                Alinhe ombros e quadril
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-5">
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#5C879C] mb-1">
                Ombros (cm)
              </label>
              <input
                type="number"
                min="60"
                max="150"
                value={measurements.shouldersCm}
                onChange={(e) =>
                  setMeasurements({ ...measurements, shouldersCm: Number(e.target.value) })
                }
                className="w-full p-2 bg-white border border-gray-300 rounded text-sm text-[#1A2733]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#5C879C] mb-1">
                Cintura (cm)
              </label>
              <input
                type="number"
                min="45"
                max="150"
                value={measurements.waistCm}
                onChange={(e) =>
                  setMeasurements({ ...measurements, waistCm: Number(e.target.value) })
                }
                className="w-full p-2 bg-white border border-gray-300 rounded text-sm text-[#1A2733]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-[#5C879C] mb-1">
                Quadril (cm)
              </label>
              <input
                type="number"
                min="60"
                max="160"
                value={measurements.hipsCm}
                onChange={(e) =>
                  setMeasurements({ ...measurements, hipsCm: Number(e.target.value) })
                }
                className="w-full p-2 bg-white border border-gray-300 rounded text-sm text-[#1A2733]"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full py-4 bg-[#4A3026] text-[#F7F7F5] font-semibold uppercase tracking-wider text-sm rounded hover:bg-[#1A2733]"
          >
            Processar em Background e Iniciar Quiz
          </button>
        </div>
      );
    }

    // 4..10: Quiz
    const currentQuiz = QUIZ_STEPS.find((q) => q.step === step);
    if (currentQuiz) {
      const selected = currentQuiz.multi ? answers[currentQuiz.key] || [] : answers[currentQuiz.key];
      const hasSelection = currentQuiz.multi ? selected.length > 0 : Boolean(selected);

      return (
        <div className="flex flex-col h-full p-6 pt-16 max-w-md mx-auto justify-between">
          <div className="overflow-y-auto pr-1">
            <div className="flex items-center justify-between text-xs text-[#5C879C] mb-2">
              <span>
                Pergunta {step - 3} de {QUIZ_STEPS.length}
              </span>
              {bgProcessing && (
                <span className="flex items-center gap-1 text-[#4A3026]">
                  <Loader2 size={12} className="animate-spin" />
                  Analisando biótipo em background...
                </span>
              )}
            </div>

            <h2
              className="text-xl md:text-2xl text-[#4A3026] font-semibold mb-1"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              {currentQuiz.title}
            </h2>
            <p className="text-sm text-[#5C879C] mb-5">{currentQuiz.subtitle}</p>

            <div className="space-y-2.5 pb-4">
              {currentQuiz.options.map((opt) => {
                const isSelected = currentQuiz.multi
                  ? selected.includes(opt)
                  : selected === opt;

                return (
                  <button
                    type="button"
                    key={opt}
                    onClick={() =>
                      handleSelectOption(
                        currentQuiz.key,
                        opt,
                        currentQuiz.multi,
                        currentQuiz.max
                      )
                    }
                    className={`w-full p-3.5 text-left rounded border flex items-center justify-between transition-colors ${
                      isSelected
                        ? 'bg-[#4A3026] text-[#F7F7F5] border-[#4A3026]'
                        : 'bg-white text-[#1A2733] border-gray-300 hover:border-[#4A3026]'
                    }`}
                  >
                    <span className="text-sm font-medium">{opt}</span>
                    {isSelected && <Check size={18} />}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            disabled={!hasSelection}
            onClick={handleNext}
            className={`w-full mt-4 py-4 uppercase tracking-widest text-sm font-semibold rounded ${
              hasSelection
                ? 'bg-[#1A2733] text-[#F7F7F5] hover:bg-[#4A3026]'
                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
          >
            {step === 10 ? 'Concluir e Ver Resultado' : 'Próxima Pergunta'}
          </button>
        </div>
      );
    }

    // 11: Resultado do Biótipo + Estilo
    if (step === 11 && finalAnalysis) {
      return (
        <div className="flex flex-col h-full p-6 pt-16 max-w-md mx-auto justify-center overflow-y-auto">
          <div className="flex items-center gap-2 text-[#4A3026] mb-4">
            <Sparkles className="text-[#5C879C]" />
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Seu Diagnóstico de Estilo
            </h2>
          </div>

          <div className="bg-white p-5 rounded-lg border border-gray-200 space-y-4 mb-6">
            <div>
              <span className="text-xs uppercase font-bold text-[#5C879C]">
                Biótipo Identificado
              </span>
              <p className="text-2xl font-bold text-[#4A3026]">{finalAnalysis.biotype}</p>
              <p className="text-xs text-[#1A2733]/80 mt-1">{finalAnalysis.biotypeRationale}</p>
            </div>

            <div className="border-t pt-3">
              <span className="text-xs uppercase font-bold text-[#5C879C]">
                Estilos Predominantes
              </span>
              <p className="text-base font-semibold text-[#1A2733] mt-1">
                {finalAnalysis.primaryStyle} + {finalAnalysis.secondaryStyle}
              </p>
              <p className="text-xs text-[#1A2733]/75 mt-1">
                Ocasião: {finalAnalysis.occasion || 'Geral'} · Perfil de compra:{' '}
                {profile.buyingProfile}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleNext}
            className="w-full py-4 bg-[#4A3026] text-[#F7F7F5] uppercase tracking-widest text-sm font-semibold rounded hover:bg-[#1A2733]"
          >
            Ver Vitrine de Recomendações
          </button>
        </div>
      );
    }

    // 12: Vitrine com Links de Afiliado
    return (
      <div className="flex flex-col h-full bg-[#F7F7F5] overflow-y-auto pb-12">
        <div className="p-6 pt-16 bg-[#1A2733] text-[#F7F7F5]">
          <h2
            className="text-2xl font-light mb-1"
            style={{ fontFamily: "'Poppins', sans-serif" }}
          >
            {profile.nome ? `${profile.nome.split(' ')[0]}, suas recomendações` : 'Suas recomendações'}
          </h2>
          <p className="text-xs text-[#5C879C]">
            Biótipo {finalAnalysis?.biotype} · Estilo {finalAnalysis?.primaryStyle} · Perfil{' '}
            {profile.buyingProfile}
          </p>
        </div>

        <div className="p-6 space-y-5 max-w-xl mx-auto w-full">
          {recommendations.map((item) => (
            <div
              key={item.id}
              className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm space-y-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5C879C]">
                  {item.brand}
                </span>
                <span className="text-sm font-bold text-[#4A3026]">
                  R$ {item.price.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <h3 className="text-base font-semibold text-[#1A2733]">{item.name}</h3>
              <p className="text-xs text-[#1A2733]/80">{item.consultingNote}</p>
              <p className="text-xs text-[#1A2733]/70 bg-[#F7F7F5] p-2.5 rounded">
                <strong>Audiodescrição:</strong> {item.audioDescription}
              </p>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() =>
                    speak(
                      `${item.name}. ${item.brand}. Preço ${item.price
                        .toFixed(2)
                        .replace('.', ',')} reais. ${item.audioDescription}`
                    )
                  }
                  className="px-3 py-2 text-xs font-medium border border-[#5C879C] text-[#5C879C] rounded flex items-center gap-1"
                >
                  <Volume2 size={14} />
                  <span>Ouvir peça</span>
                </button>

                <a
                  href={item.affiliateUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-[#4A3026] text-[#F7F7F5] text-xs font-semibold rounded flex items-center gap-1.5 hover:bg-[#1A2733]"
                >
                  <ShoppingBag size={14} />
                  <span>Ir para loja (Parceiro)</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="h-screen w-full bg-[#F7F7F5] relative overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {step > 0 && (
        <div className="absolute top-4 left-4 right-4 z-50 flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Voltar"
            className="p-2 bg-white rounded-full shadow text-[#1A2733] hover:text-[#4A3026]"
          >
            <ChevronLeft size={22} />
          </button>

          {accessibility && (
            <button
              type="button"
              onClick={() => speakCurrentScreen(step)}
              className="px-3 py-1.5 bg-[#5C879C] text-white text-xs font-semibold rounded-full shadow flex items-center gap-1.5"
            >
              <RotateCcw size={14} />
              <span>Reouvir tela</span>
            </button>
          )}
        </div>
      )}
      {renderScreen()}
    </div>
  );
}
