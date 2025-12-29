import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, addDoc, onSnapshot, 
  doc, setDoc, query, where, getDocs 
} from 'firebase/firestore';
import { 
  getAuth, signInAnonymously, onAuthStateChanged 
} from 'firebase/auth';
import { 
  ShoppingCart, LogOut, Plus, Minus, PackageCheck, 
  Droplets, BarChart3, Users, TrendingUp, AlertCircle, Wifi, WifiOff
} from 'lucide-react';

// KONFIGURASI FIREBASE ANDA
const firebaseConfig = {
  apiKey: "AIzaSyCyDBqKjTsVxlp22VkeaZqxO_x_pZYGsg4",
  authDomain: "mesin-kasir-pos.firebaseapp.com",
  projectId: "mesin-kasir-pos",
  storageBucket: "mesin-kasir-pos.firebasestorage.app",
  messagingSenderId: "274782253142",
  appId: "1:274782253142:web:a8fde5df9b713a9ce34bf7",
  measurementId: "G-WTN1W0DVFY"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "mesin-kasir-salman"; // ID unik untuk aplikasi Anda di Firestore

const MENU_ITEMS = [
  { id: 'r1', name: 'Roti Original', price: 10000, category: 'roti' },
  { id: 'r2', name: 'Roti Coklat', price: 11000, category: 'roti' },
  { id: 'r3', name: 'Coklat Kacang', price: 12000, category: 'roti' },
  { id: 'r4', name: 'Roti Daging', price: 13000, category: 'roti' },
  { id: 'm1', name: 'Le Mineral', price: 5000, category: 'minuman' },
  { id: 'm2', name: 'Sari Apel', price: 8000, category: 'minuman' },
  { id: 'm3', name: 'Madu Salman', price: 5000, category: 'minuman' },
];

const ROTI_VARIANTS = ["Original", "Coklat", "Coklat Kacang", "Daging"];

export default function App() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [activeTab, setActiveTab] = useState('kasir');
  const [selectedShift, setSelectedShift] = useState('Pagi');
  const [cart, setCart] = useState({});
  const [transactions, setTransactions] = useState([]);
  const [stockData, setStockData] = useState([]);
  const [sauceLogs, setSauceLogs] = useState([]);
  const [staffTokens, setStaffTokens] = useState({});
  const [cashAmount, setCashAmount] = useState('');
  const [showReceipt, setShowReceipt] = useState(null);
  const [isOnline, setIsOnline] = useState(true);
  
  const [sauceForm, setSauceForm] = useState({ variant: 'Original', qty: '' });
  const [reportType, setReportType] = useState('daily');

  // Inisialisasi Autentikasi
  useEffect(() => {
    const initAuth = async () => {
      try {
        // Kami menggunakan Anonymous login agar mudah digunakan di POS
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
        setIsOnline(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Sync Data dari Firestore Anda
  useEffect(() => {
    if (!user) return;
    
    // Path: /artifacts/mesin-kasir-salman/public/data/{collection}
    const baseRef = (col) => collection(db, 'artifacts', appId, 'public', 'data', col);

    const unsubTrans = onSnapshot(baseRef('transactions'), 
      (snap) => { setTransactions(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setIsOnline(true); },
      () => setIsOnline(false)
    );

    const unsubStock = onSnapshot(baseRef('stocks'), (snap) => {
      setStockData(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubSauce = onSnapshot(baseRef('sauceLogs'), (snap) => {
      setSauceLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubTokens = onSnapshot(baseRef('tokens'), (snap) => {
      const tokens = {};
      snap.docs.forEach(d => { tokens[d.data().code] = d.data(); });
      setStaffTokens(tokens);
    });

    return () => { unsubTrans(); unsubStock(); unsubSauce(); unsubTokens(); };
  }, [user]);

  // UI Helpers
  const formatIDR = (val) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);

  // Perhitungan Kasir
  const cartTotal = useMemo(() => Object.values(cart).reduce((s, i) => s + (i.price * i.qty), 0), [cart]);
  
  const addToCart = (item) => {
    setCart(prev => ({
      ...prev,
      [item.id]: { ...item, qty: (prev[item.id]?.qty || 0) + 1 }
    }));
  };

  const removeFromCart = (itemId) => {
    setCart(prev => {
      const newCart = { ...prev };
      if (!newCart[itemId]) return prev;
      if (newCart[itemId].qty > 1) { 
        newCart[itemId] = { ...newCart[itemId], qty: newCart[itemId].qty - 1 }; 
      } else { 
        delete newCart[itemId]; 
      }
      return newCart;
    });
  };

  const handlePayment = async () => {
    if (!user || cartTotal === 0) return;
    const cash = parseInt(cashAmount);
    if (isNaN(cash) || cash < cartTotal) return;

    const now = new Date();
    const data = {
      items: Object.values(cart).map(i => ({ name: i.name, price: i.price, qty: i.qty })),
      total: cartTotal,
      cash,
      change: cash - cartTotal,
      cashier: session.name,
      shift: session.shift,
      timestamp: now.toISOString(),
      date: now.toISOString().split('T')[0],
      month: now.toISOString().substring(0, 7),
      year: now.toISOString().substring(0, 4)
    };

    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), data);
      setShowReceipt({ ...data, id: docRef.id });
      setCart({});
      setCashAmount('');
    } catch (e) { console.error("Payment Error:", e); }
  };

  // Logika Stok
  const currentStock = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    const shift = session?.shift || 'Pagi';
    const docId = `${today}_${shift}`;
    return stockData.find(s => s.id === docId) || { id: docId, date: today, shift: shift, items: {} };
  }, [stockData, session]);

  const updateStock = async (type, itemName, value) => {
    if (!session || !user) return;
    const newItems = { ...currentStock.items };
    if (!newItems[itemName]) newItems[itemName] = { awal: 0, akhir: 0 };
    newItems[itemName][type] = parseInt(value) || 0;
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'stocks', currentStock.id), { 
        ...currentStock, 
        items: newItems, 
        updatedAt: new Date().toISOString() 
      });
    } catch (e) { console.error("Stock Update Error:", e); }
  };

  const filteredSales = useMemo(() => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const thisMonth = now.toISOString().substring(0, 7);
    const thisYear = now.toISOString().substring(0, 4);

    const data = transactions.filter(t => {
      if (reportType === 'daily') return t.date === today;
      if (reportType === 'monthly') return t.month === thisMonth;
      if (reportType === 'yearly') return t.year === thisYear;
      return false;
    });

    const total = data.reduce((sum, t) => sum + t.total, 0);
    const itemsCount = {};
    data.forEach(t => t.items.forEach(i => { itemsCount[i.name] = (itemsCount[i.name] || 0) + i.qty; }));
    return { data, total, itemsCount };
  }, [transactions, reportType]);

  // Screen: Login
  if (!session) {
    return (
      <div className="min-h-screen bg-orange-600 flex items-center justify-center p-6">
        <div className="bg-white w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl text-center">
          <div className="w-16 h-16 bg-orange-100 rounded-2xl flex items-center justify-center mx-auto mb-6 text-orange-600">
            <ShoppingCart size={32} />
          </div>
          <h1 className="text-3xl font-black italic tracking-tighter text-slate-800 mb-2 uppercase">Salman POS</h1>
          <p className="text-slate-400 font-bold text-[10px] uppercase tracking-[0.2em] mb-8">Cloud Connected: {firebaseConfig.projectId}</p>
          <form onSubmit={(e) => {
            e.preventDefault();
            const token = e.target.token.value.toUpperCase();
            const found = staffTokens[token] || (token === 'SUPER77' ? { name: 'Admin', role: 'spv' } : null);
            if (found) setSession({ ...found, shift: selectedShift });
            else alert("Token Salah!");
          }} className="space-y-4">
            <div className="flex bg-slate-100 p-1.5 rounded-xl gap-1">
              {['Pagi', 'Siang'].map(s => (
                <button key={s} type="button" onClick={() => setSelectedShift(s)} className={`flex-1 py-2.5 rounded-lg font-black text-[10px] uppercase transition-all ${selectedShift === s ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-400'}`}>{s}</button>
              ))}
            </div>
            <input name="token" type="password" placeholder="TOKEN AKSES" className="w-full bg-slate-100 p-4 rounded-xl text-center font-black outline-none border-2 border-transparent focus:border-orange-500 uppercase" required />
            <button className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[11px] tracking-widest hover:bg-slate-800 shadow-lg">MASUK SISTEM</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col font-sans text-slate-900">
      <header className="bg-white border-b px-6 py-4 flex justify-between items-center shrink-0 z-50">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 ${session.role === 'spv' ? 'bg-slate-900' : 'bg-orange-600'} rounded-xl flex items-center justify-center text-white font-black italic shadow-lg`}>
            {session.role === 'spv' ? 'S' : 'K'}
          </div>
          <div>
            <h1 className="text-sm font-black italic uppercase leading-none">{session.name}</h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">
              Shift {session.shift} • {isOnline ? 'ONLINE' : 'OFFLINE'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[9px] font-black uppercase ${isOnline ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
            {isOnline ? <Wifi size={12}/> : <WifiOff size={12}/>}
            {isOnline ? 'Database Connected' : 'Connecting...'}
          </div>
          <button onClick={() => setSession(null)} className="p-2.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-all">
            <LogOut size={18}/>
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-24 p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'kasir' && session.role === 'kasir' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-4">
                {MENU_ITEMS.map(item => (
                  <button key={item.id} onClick={() => addToCart(item)} className="bg-white p-6 rounded-3xl border border-slate-100 hover:border-orange-500 hover:shadow-xl transition-all text-left flex flex-col justify-between h-40 relative overflow-hidden">
                    {cart[item.id] && <div className="absolute top-3 right-3 bg-orange-600 text-white w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black">{cart[item.id].qty}</div>}
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
                    <div>
                      <p className="font-black text-sm uppercase leading-tight mb-1">{item.name}</p>
                      <p className="text-lg font-black italic text-orange-600">{formatIDR(item.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="lg:col-span-4 bg-slate-900 rounded-[2.5rem] p-6 text-white shadow-2xl h-fit sticky top-4">
                <h3 className="font-black text-[10px] uppercase tracking-widest mb-6 border-b border-white/10 pb-4">Pesanan Baru</h3>
                <div className="space-y-4 mb-8 max-h-[40vh] overflow-y-auto pr-2">
                  {Object.values(cart).map(item => (
                    <div key={item.id} className="flex justify-between items-center">
                      <div className="flex-1 min-w-0 pr-4">
                        <p className="font-black text-[11px] uppercase truncate">{item.name}</p>
                        <p className="text-[9px] text-white/40 font-bold">{formatIDR(item.price)}</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white/5 rounded-xl p-1">
                        <button onClick={() => removeFromCart(item.id)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-red-500"><Minus size={12}/></button>
                        <span className="text-[11px] font-black w-4 text-center">{item.qty}</span>
                        <button onClick={() => addToCart(item)} className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-orange-500"><Plus size={12}/></button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="space-y-4 pt-4 border-t border-white/10">
                  <div className="flex justify-between items-end"><span className="text-[9px] font-black uppercase text-white/40">Total Tagihan</span><span className="text-2xl font-black italic text-orange-400">{formatIDR(cartTotal)}</span></div>
                  <input type="number" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="Nominal Tunai..." className="w-full bg-white/5 border border-white/10 p-4 rounded-xl text-center text-xl font-black outline-none focus:border-orange-500" />
                  <button onClick={handlePayment} disabled={cartTotal === 0 || !cashAmount} className="w-full bg-orange-600 py-4 rounded-xl font-black text-[11px] uppercase tracking-widest hover:bg-orange-500 disabled:opacity-50">CETAK STRUK & SIMPAN</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'laporan' && session.role === 'spv' && (
            <div className="space-y-6">
               <div className="flex gap-2 bg-white p-2 rounded-2xl border w-fit">
                {['daily', 'monthly', 'yearly'].map(t => (
                  <button key={t} onClick={() => setReportType(t)} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase ${reportType === t ? 'bg-slate-900 text-white' : 'text-slate-400'}`}>{t}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard label="Total Omzet" value={formatIDR(filteredSales.total)} color="text-slate-900" />
                <StatCard label="Total Transaksi" value={filteredSales.data.length} color="text-orange-600" />
                <StatCard label="Menu Terlaris" value={Object.entries(filteredSales.itemsCount).sort((a,b)=>b[1]-a[1])[0]?.[0] || '-'} color="text-slate-900" />
              </div>
            </div>
          )}

          {activeTab === 'stok' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-white rounded-[2rem] p-6 border shadow-sm">
                <h3 className="font-black text-xs uppercase mb-6 flex items-center gap-2"><PackageCheck className="text-orange-600"/> Audit Stok {session.shift}</h3>
                <div className="space-y-3">
                  {MENU_ITEMS.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                      <span className="text-[10px] font-black uppercase">{item.name}</span>
                      <div className="flex gap-2">
                        <input type="number" value={currentStock.items?.[item.name]?.awal || ''} onChange={(e)=>updateStock('awal', item.name, e.target.value)} placeholder="Awal" className="w-16 p-2 bg-white border rounded-lg text-center text-[10px] font-black" />
                        <input type="number" value={currentStock.items?.[item.name]?.akhir || ''} onChange={(e)=>updateStock('akhir', item.name, e.target.value)} placeholder="Akhir" className="w-16 p-2 bg-white border rounded-lg text-center text-[10px] font-black" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-slate-900 rounded-[2rem] p-6 text-white">
                <h3 className="font-black text-xs uppercase mb-6 text-orange-400">Analisis Selisih</h3>
                <div className="space-y-4">
                  {MENU_ITEMS.map(item => {
                    const st = currentStock.items?.[item.name] || { awal: 0, akhir: 0 };
                    const sold = transactions.filter(t => t.date === new Date().toISOString().split('T')[0] && t.shift === session.shift).reduce((acc, t) => acc + (t.items.find(i=>i.name===item.name)?.qty || 0), 0);
                    const diff = st.akhir - (st.awal - sold);
                    return (
                      <div key={item.id} className="flex justify-between text-[10px] font-black border-b border-white/5 pb-2">
                        <span className="uppercase">{item.name}</span>
                        <span className={diff === 0 ? 'text-green-400' : 'text-red-400'}>{diff > 0 ? `+${diff}` : diff}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer Nav */}
      <nav className="fixed bottom-0 w-full bg-white border-t py-3 flex justify-around items-center z-[100]">
        <NavBtn active={activeTab === 'kasir'} onClick={() => setActiveTab('kasir')} icon={<ShoppingCart size={20}/>} label="Kasir" />
        {session.role === 'spv' && <NavBtn active={activeTab === 'laporan'} onClick={() => setActiveTab('laporan')} icon={<BarChart3 size={20}/>} label="Laporan" />}
        <NavBtn active={activeTab === 'stok'} onClick={() => setActiveTab('stok')} icon={<PackageCheck size={20}/>} label="Stok" />
        <NavBtn active={activeTab === 'saos'} onClick={() => setActiveTab('saos')} icon={<Droplets size={20}/>} label="Saos" />
      </nav>

      {/* Struk Modal */}
      {showReceipt && (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-sm rounded-[2rem] p-8">
            <div className="text-center mb-6">
              <h2 className="font-black italic text-xl uppercase">SALMAN BAKERY</h2>
              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Transaksi Berhasil Disimpan</p>
            </div>
            <div className="border-y border-dashed py-4 mb-4 space-y-2">
              {showReceipt.items.map((i, idx) => (
                <div key={idx} className="flex justify-between text-[10px] font-black uppercase">
                  <span>{i.name} x{i.qty}</span>
                  <span>{formatIDR(i.price * i.qty)}</span>
                </div>
              ))}
            </div>
            <div className="text-right space-y-1 mb-6">
              <p className="text-xs font-black">TOTAL: {formatIDR(showReceipt.total)}</p>
              <p className="text-[10px] font-bold text-slate-400">TUNAI: {formatIDR(showReceipt.cash)}</p>
              <p className="text-xs font-black text-green-600">KEMBALI: {formatIDR(showReceipt.change)}</p>
            </div>
            <button onClick={() => setShowReceipt(null)} className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-[10px] uppercase">Tutup Struk</button>
          </div>
        </div>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} className={`flex flex-col items-center gap-1 transition-all ${active ? 'text-orange-600' : 'text-slate-300'}`}>
      {icon}
      <span className="text-[8px] font-black uppercase">{label}</span>
    </button>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-white p-6 rounded-[2rem] border shadow-sm">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-2xl font-black italic ${color}`}>{value}</p>
    </div>
  );
}   