import React, { useState, useEffect } from 'react';
import { Camera, ChevronLeft, ShoppingBag, ArrowRight, Check, Sparkles } from 'lucide-react';
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

// --- Componente Principal ---
export default function AyanmoApp() {
  const [user, setUser] = useState(null);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [animatingStep, setAnimatingStep] = useState(false);

  // Estados dos Formulários e Respostas
  const [profile, setProfile] = useState({ nome: '', genero: '', email: '', telefone: '', aniversario: '' });
  const [accessibility, setAccessibility] = useState(null);
  const [answers, setAnswers] = useState({
    objetivo: '',
    prioridade: '',
    percepcao: [], // Até 2 opções
    guardaRoupa: '',
    tecido: '',
    cores: '',
    estampas: ''
  });

  // Autenticação Silenciosa (Firebase)
  useEffect(() => {
    if (!auth) return;
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (error) {
        console.error("Auth error:", error);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Injeção de Fontes do Google
  useEffect(() => {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&family=Poppins:wght@400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }, []);

  // Navegação Suave
  const nextStep = () => {
    setAnimatingStep(true);
    setTimeout(() => {
      setStep(s => s + 1);
      setAnimatingStep(false);
    }, 300);
  };

  const prevStep = () => {
    setAnimatingStep(true);
    setTimeout(() => {
      setStep(s => s - 1);
      setAnimatingStep(false);
    }, 300);
  };

  // Auto-avançar na Visão Computacional (Scanner Mock)
  useEffect(() => {
    if (step === 10) {
      const timer = setTimeout(() => { nextStep(); }, 4000);
      return () => clearTimeout(timer);
    }
  }, [step]);

  // Salvar no Firebase após cadastro
  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    if (!profile.nome) return;
    setLoading(true);
    try {
      if (db && user) {
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'ayanmo-default';
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'profiles'), {
          ...profile,
          createdAt: serverTimestamp()
        });
      }
    } catch (err) {
      console.error("Erro ao salvar:", err);
    } finally {
      setLoading(false);
      nextStep();
    }
  };

  // Tratamento de Seleção de Opções
  const handleOptionSelect = (key, value, isMulti = false, max = 1) => {
    if (isMulti) {
      let current = [...answers[key]];
      if (current.includes(value)) {
        current = current.filter(v => v !== value);
      } else if (current.length < max) {
        current.push(value);
      }
      setAnswers({ ...answers, [key]: current });
    } else {
      setAnswers({ ...answers, [key]: value });
      // Avança automaticamente para opções únicas com um pequeno delay visual
      setTimeout(nextStep, 400); 
    }
  };

  // --- Renderização de Telas ---
  const renderStep = () => {
    switch (step) {
      case 0: // Splash
        return (
          <div className="flex flex-col items-center justify-center h-full text-center p-8 cursor-pointer" onClick={nextStep}>
            <div className="mb-8 border-4 border-[#4A3026] p-6 rotate-45">
               <div className="-rotate-45">
                 <h1 className="text-4xl md:text-6xl font-bold text-[#4A3026] tracking-widest uppercase" style={{ fontFamily: "'Poppins', sans-serif" }}>Ayanmo</h1>
               </div>
            </div>
            <p className="text-[#1A2733] text-lg font-light tracking-wide uppercase" style={{ fontFamily: "'Inter', sans-serif" }}>Sua assistente de estilo</p>
            <button className="mt-16 text-[#5C879C] flex items-center space-x-2 animate-pulse font-medium">
              <span>Toque para começar</span>
              <ArrowRight size={16} />
            </button>
          </div>
        );

      case 1: // Cadastro
        return (
          <div className="flex flex-col h-full p-6 md:p-12 max-w-md mx-auto">
            <h2 className="text-2xl text-[#4A3026] mb-8 font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>Que bom ter você aqui! Por favor, informe seus dados.</h2>
            <form onSubmit={handleRegisterSubmit} className="space-y-6 flex-1">
              {['nome', 'email', 'telefone', 'aniversario'].map((field) => (
                <div key={field} className="relative border-b border-[#1A2733]/20 pb-1">
                  <input
                    type={field === 'email' ? 'email' : field === 'aniversario' ? 'date' : 'text'}
                    placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
                    required={field === 'nome'}
                    className="w-full bg-transparent outline-none text-[#1A2733] placeholder-[#1A2733]/50 font-light"
                    value={profile[field]}
                    onChange={(e) => setProfile({...profile, [field]: e.target.value})}
                  />
                </div>
              ))}
              <div className="pt-4">
                <p className="text-sm text-[#1A2733]/60 mb-2 font-light">Gênero</p>
                <div className="flex space-x-4">
                  {['Feminino', 'Masculino', 'Outro'].map(g => (
                    <button type="button" key={g} onClick={() => setProfile({...profile, genero: g})}
                      className={`px-4 py-2 text-sm border transition-colors ${profile.genero === g ? 'border-[#4A3026] bg-[#4A3026] text-[#F7F7F5]' : 'border-[#1A2733]/20 text-[#1A2733]'}`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={loading} className="w-full mt-8 bg-[#1A2733] text-[#F7F7F5] py-4 uppercase tracking-widest text-sm font-medium hover:bg-[#4A3026] transition-colors">
                {loading ? 'Salvando...' : 'Continuar'}
              </button>
            </form>
          </div>
        );

      case 2: // Acessibilidade
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 text-center max-w-md mx-auto">
             <h2 className="text-2xl text-[#4A3026] mb-12" style={{ fontFamily: "'Poppins', sans-serif" }}>{profile.nome ? profile.nome.split(' ')[0] : 'Usuário'}, você precisa de algum recurso de acessibilidade?</h2>
             <div className="flex space-x-6 w-full">
               <button onClick={() => { setAccessibility(true); nextStep(); }} className="flex-1 py-4 border-2 border-[#1A2733] text-[#1A2733] hover:bg-[#1A2733] hover:text-[#F7F7F5] transition-colors">Sim</button>
               <button onClick={() => { setAccessibility(false); nextStep(); }} className="flex-1 py-4 border-2 border-[#1A2733] text-[#1A2733] hover:bg-[#1A2733] hover:text-[#F7F7F5] transition-colors">Não</button>
             </div>
          </div>
        );

      case 5: // Percepção (Até 2 opções)
        return (
          <div className="flex flex-col h-full animate-fade-in max-w-md mx-auto w-full">
            <h2 className="text-2xl md:text-3xl text-[var(--color-ayanmo-brown)] mb-2 tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>Como você quer ser percebida com este look?</h2>
            <p className="text-[var(--color-ayanmo-blue)] mb-8">Escolha até 2 opções.</p>
            <div className="flex flex-col gap-3 mb-8">
              {['Profissional', 'Confiante', 'Acessível', 'Criativa', 'Elegante', 'Marcante'].map((opcao) => (
                <button
                  key={opcao}
                  onClick={() => {
                    const selecionadas = answers.percepcao || [];
                    const isDeselecting = selecionadas.includes(opcao);
                    
                    handleOptionSelect('percepcao', opcao, true, 2);
                    
                    // Avança automaticamente quando for a segunda escolha válida
                    if (!isDeselecting && selecionadas.length === 1) {
                      setTimeout(() => nextStep(), 400);
                    }
                  }}
                  className={`p-4 border text-left flex justify-between items-center transition-all duration-300 ${
                    answers.percepcao?.includes(opcao)
                      ? 'bg-[var(--color-ayanmo-brown)] border-[var(--color-ayanmo-brown)] text-[var(--color-ayanmo-light)]'
                      : 'bg-transparent border-gray-300 text-gray-700 hover:border-[var(--color-ayanmo-brown)]'
                  }`}
                >
                  {opcao}
                  {answers.percepcao?.includes(opcao) && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        );

      case 3:
      case 4:
      case 6:
      case 7:
      case 8:
      case 9: // Agrupando todas as perguntas de múltipla escolha simples
        const questions = {
          3: { key: 'objetivo', title: 'O que você procura hoje?', options: ['Look Casual', 'Look Esportivo', 'Look para Trabalho', 'Look de Festa', 'Moda Praia', 'Look para Viagem', 'Moda Íntima'] },
          4: { key: 'prioridade', title: 'O que mais importa pra você numa roupa?', options: ['Conforto', 'Elegância', 'Delicadeza', 'Sensualidade', 'Impacto', 'Discrição', 'Criatividade'] },
          6: { key: 'guardaRoupa', title: 'Do que você mais gosta no seu guarda-roupa?', options: ['Roupas confortáveis', 'Roupas elegantes e bem cortadas', 'Peças delicadas e românticas', 'Roupas que valorizam o corpo', 'Peças marcantes e diferentes', 'Itens básicos', 'Peças criativas e únicas'] },
          7: { key: 'tecido', title: 'Qual tipo de tecido te atrai mais?', options: ['Macio e confortável', 'Fino e sofisticado', 'Leve e fluído', 'Justo e elástico', 'Estruturado com forma firme', 'Neutro e simples', 'Colorido ou diferente'] },
          8: { key: 'cores', title: 'Como você mistura as cores na sua roupa?', options: ['Cores intensas e marcantes', 'Tons pastéis e suaves', 'Vários tons da mesma cor', 'Cores neutras (preto, branco, cinza)', 'Cores contrastantes (color block)', 'Cores que estão na moda', 'Poucas cores, estilo simples'] },
          9: { key: 'estampas', title: 'Se fosse escolher uma estampa, qual seria?', options: ['Neutra ou sem estampa', 'Estampa pequena e discreta', 'Geométrica ou abstrata', 'Várias estampas misturadas', 'Listrado ou xadrez clássico', 'Floral delicado', 'Animal print'] }
        };
        const currentQ = questions[step];
        return (
          <div className="flex flex-col h-full p-6 md:p-12 max-w-md mx-auto w-full animate-fade-in">
            <h2 className="text-2xl md:text-3xl text-[var(--color-ayanmo-brown)] mb-8 leading-tight tracking-tight" style={{ fontFamily: "'Poppins', sans-serif" }}>{currentQ.title}</h2>
            <div className="flex-1 overflow-y-auto space-y-3 pb-8">
              {currentQ.options.map((opt) => (
                <button 
                  key={opt} 
                  onClick={() => handleOptionSelect(currentQ.key, opt)}
                  className={`w-full text-left p-4 border transition-all duration-300 flex justify-between items-center ${
                    answers[currentQ.key] === opt 
                    ? 'border-[var(--color-ayanmo-brown)] bg-[var(--color-ayanmo-brown)] text-[var(--color-ayanmo-light)]' 
                    : 'border-gray-300 text-gray-700 hover:border-[var(--color-ayanmo-brown)]'
                  }`}
                >
                  {opt}
                  {answers[currentQ.key] === opt && <Check size={20} />}
                </button>
              ))}
            </div>
          </div>
        );

      case 10: // Visão Computacional (Scanner Mock)
        return (
          <div className="flex flex-col items-center justify-center h-full p-6 bg-[#1A2733] text-[#F7F7F5] relative overflow-hidden">
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #5C879C 0%, transparent 70%)' }}></div>
            <h2 className="text-2xl text-center mb-12 font-light z-10 max-w-sm" style={{ fontFamily: "'Poppins', sans-serif" }}>
              Para realizarmos a análise do seu biotipo, posicione-se no local indicado, abra os braços e não se mova.
            </h2>
            
            <div className="relative w-64 h-80 border border-[#5C879C]/50 mb-8 flex items-center justify-center z-10">
              <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#5C879C]"></div>
              <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#5C879C]"></div>
              <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#5C879C]"></div>
              <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#5C879C]"></div>
              
              <Camera size={48} className="text-[#5C879C]/30" />
              
              <div className="absolute top-0 left-0 w-full h-1 bg-[#5C879C] shadow-[0_0_15px_#5C879C] animate-[scan_2s_ease-in-out_infinite_alternate]"></div>
            </div>
            
            <p className="text-[#5C879C] animate-pulse z-10 uppercase tracking-widest text-sm">Analisando proporções...</p>
          </div>
        );

      case 11: // Resultado de Estilo
        return (
          <div className="flex flex-col h-full p-6 md:p-12 max-w-md mx-auto">
            <div className="flex items-center space-x-3 mb-8 text-[#4A3026]">
              <Sparkles className="text-[#5C879C]" />
              <h2 className="text-2xl font-semibold" style={{ fontFamily: "'Poppins', sans-serif" }}>Quanta personalidade!</h2>
            </div>
            <p className="text-[#1A2733] mb-8 font-light">Estes são os seus estilos predominantes baseados na nossa análise conjunta:</p>
            
            <div className="space-y-6 flex-1">
              <div className="border-l-2 border-[#4A3026] pl-4">
                <p className="text-xs uppercase text-[#5C879C] tracking-widest mb-1">Aparência</p>
                <p className="text-xl text-[#1A2733]" style={{ fontFamily: "'Poppins', sans-serif" }}>Esportiva / Clássica</p>
              </div>
              <div className="border-l-2 border-[#1A2733] pl-4">
                <p className="text-xs uppercase text-[#5C879C] tracking-widest mb-1">Comunicação</p>
                <p className="text-xl text-[#1A2733]" style={{ fontFamily: "'Poppins', sans-serif" }}>Elegante</p>
              </div>
              <div className="border-l-2 border-[#5C879C] pl-4">
                <p className="text-xs uppercase text-[#5C879C] tracking-widest mb-1">Comportamento</p>
                <p className="text-xl text-[#1A2733]" style={{ fontFamily: "'Poppins', sans-serif" }}>Exuberante</p>
              </div>
            </div>

            <button onClick={nextStep} className="mt-8 w-full bg-[#4A3026] text-[#F7F7F5] py-4 uppercase tracking-widest text-sm font-medium hover:bg-[#1A2733] transition-colors">
              Ver minhas recomendações
            </button>
          </div>
        );

      case 12: { // Vitrine
        const recommendations = [
          { 
            id: 1, 
            image: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=600", 
            desc: "Blazer Estruturado Marrom", 
            price: "R\$ 359,90",
            store: "Zara",
            link: "https://www.zara.com/br/" 
          },
          { 
            id: 2, 
            image: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&q=80&w=600", 
            desc: "Conjunto Alfaiataria Leve", 
            price: "R\$ 289,50",
            store: "Amaro",
            link: "https://amaro.com/br/pt/" 
          },
          { 
            id: 3, 
            image: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&q=80&w=600", 
            desc: "Vestido Midi Fluído", 
            price: "R\$ 199,90",
            store: "Renner",
            link: "https://www.lojasrenner.com.br/" 
          }
        ];

        return (
          <div className="flex flex-col h-full bg-[var(--color-ayanmo-light)] overflow-y-auto pb-12">
            <div className="p-6 md:p-8 bg-[#1A2733] text-[var(--color-ayanmo-light)]">
              <h2 className="text-2xl font-light mb-2" style={{ fontFamily: "'Poppins', sans-serif" }}>
                {profile.nome ? profile.nome.split(' ')[0] : 'Wendy'}, aqui estão suas opções.
              </h2>
              <p className="text-[#5C879C] text-sm">Peças selecionadas com base no seu perfil.</p>
            </div>
            
            <div className="p-6 grid gap-8 max-w-2xl mx-auto w-full">
              {recommendations.map(item => (
                <div key={item.id} className="group relative bg-white rounded-lg shadow-sm overflow-hidden border border-gray-100">
                  <div className="aspect-[3/4] overflow-hidden bg-gray-200">
                    <img src={item.image} alt={item.desc} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  </div>
                  
                  <div className="p-4 flex flex-col gap-1 bg-white">
                    <span className="text-xs text-[#5C879C] uppercase tracking-wider font-semibold">{item.store}</span>
                    <h3 className="text-[#1A2733] font-medium leading-tight">{item.desc}</h3>
                    <p className="text-[#4A3026] font-bold mt-1">{item.price}</p>
                  </div>

                  <button 
                    onClick={() => window.open(item.link, '_blank')}
                    className="absolute top-4 right-4 w-12 h-12 bg-[#F7F7F5] text-[#4A3026] rounded-full flex items-center justify-center hover:bg-[#4A3026] hover:text-[#F7F7F5] shadow-lg transition-all duration-300 transform hover:scale-110"
                    title="Comprar no site da loja"
                  >
                    <ShoppingBag size={22} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div className="h-screen w-full bg-[var(--color-ayanmo-light)] relative">
      {step > 0 && step < 10 && (
        <button 
          onClick={prevStep} 
          className="absolute top-6 left-6 z-50 text-[#1A2733] hover:text-[#4A3026] transition-colors"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {renderStep()}
    </div>
  );
}