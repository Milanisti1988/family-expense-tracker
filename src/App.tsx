import React, { useState, useMemo, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { 
  Camera, Upload, Plus, Wallet, PieChart, Receipt, Users, 
  ArrowUpRight, CheckCircle2, AlertTriangle, ArrowRight, 
  Trash2, Download, Calendar, Filter, Sparkles, X, ChevronRight,
  TrendingDown, ShieldCheck, RefreshCw, Layers
} from 'lucide-react';

// Default categories with budget caps and icons
const DEFAULT_CATEGORIES = [
  { id: 'transport', name: 'Transport & School Pickup', icon: '🚗', budget: 2500000, color: '#3B82F6' },
  { id: 'groceries', name: 'Groceries & Market', icon: '🛒', budget: 4000000, color: '#10B981' },
  { id: 'children', name: 'Children & Education', icon: '🎒', budget: 3500000, color: '#8B5CF6' },
  { id: 'utilities', name: 'Bills & Utilities (PLN, WiFi)', icon: '⚡', budget: 1800000, color: '#F59E0B' },
  { id: 'dining', name: 'Dining Out & Coffee', icon: '🍽️', budget: 2000000, color: '#EC4899' },
  { id: 'household', name: 'Home Supplies & Maintenance', icon: '🏡', budget: 1200000, color: '#06B6D4' },
  { id: 'leisure', name: 'Family Weekend & Leisure', icon: '🍿', budget: 1500000, color: '#6366F1' },
];

// Initial seeded records including the user's specific Livin' by Mandiri transaction
const INITIAL_TRANSACTIONS = [
  {
    id: 'tx-1',
    refNo: '20261106BMRIIDJA01000223809759',
    title: 'Jemput Nadya Oktober 2026',
    recipient: 'JUNAIDI HUSEIN (BCA)',
    payer: 'Anom',
    amount: 650000,
    fee: 2500,
    total: 652500,
    category: 'transport',
    date: '2026-11-06T06:16:02',
    source: 'Livin by Mandiri',
    notes: 'BiFast transfer for daily school pickup'
  },
  {
    id: 'tx-2',
    refNo: '20261104BCA0009823412',
    title: 'Superindo Weekly Grocery',
    recipient: 'Superindo Tebet',
    payer: 'Wife',
    amount: 845000,
    fee: 0,
    total: 845000,
    category: 'groceries',
    date: '2026-11-04T18:22:00',
    source: 'QRIS BCA',
    notes: 'Vegetables, milk, fruits & household soap'
  },
  {
    id: 'tx-3',
    refNo: '20261102PLN9912034',
    title: 'Token Listrik PLN Rumah',
    recipient: 'PLN Prepaid',
    payer: 'Anom',
    amount: 1000000,
    fee: 2500,
    total: 1002500,
    category: 'utilities',
    date: '2026-11-02T09:10:00',
    source: 'Livin by Mandiri',
    notes: 'Listrik 3500VA'
  },
  {
    id: 'tx-4',
    refNo: '20261101SCH00421',
    title: 'Buku Pelajaran & Renang Nadya',
    recipient: 'Sekolah Cikal / Yayasan',
    payer: 'Wife',
    amount: 1250000,
    fee: 0,
    total: 1250000,
    category: 'children',
    date: '2026-11-01T14:45:00',
    source: 'Bank Transfer',
    notes: 'Semester 1 swimming & extra curriculum'
  },
  {
    id: 'tx-5',
    refNo: '20261028KOP9921',
    title: 'Dinner Family Weekend',
    recipient: 'Pagi Sore Kemang',
    payer: 'Anom',
    amount: 580000,
    fee: 0,
    total: 580000,
    category: 'dining',
    date: '2026-10-28T19:30:00',
    source: 'QRIS Livin',
    notes: 'Ayam pop + rendang'
  }
];

// Specialized parser for Livin' by Mandiri formats: Transfer, QRIS, Bayar/VA, Top-up
function parseLivinReceipt(ocrText: string, defaultUser: string) {
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const fullText = lines.join(' ');

  // 1. Determine Transaction Type & Source
  let source = "Livin' Transfer";
  if (/QR\s*Bayar|QRIS/i.test(ocrText)) {
    source = 'Livin QRIS';
  } else if (/Top-up/i.test(ocrText)) {
    source = 'Livin Top-up';
  } else if (/Bayar\s*Pembayaran/i.test(ocrText) || /Penyedia\s*Jasa/i.test(ocrText)) {
    source = 'Livin Bayar/VA';
  }

  // 2. Extract Recipient / Merchant / Provider
  let recipient = 'Pengeluaran Mandiri';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^(Penerima|Penyedia\s*Jasa)$/i.test(line) && lines[i + 1]) {
      recipient = lines[i + 1];
      break;
    }
  }

  // 3. Extract Amount (Priority: Total Transaksi -> Nominal Transfer -> Nominal)
  const extractAmountFromMatch = (pattern: RegExp) => {
    const match = ocrText.match(pattern);
    if (match && match[1]) {
      const clean = match[1].replace(/\./g, '').replace(/,/g, '').trim();
      const num = parseInt(clean, 10);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  let totalAmount = extractAmountFromMatch(/Total\s*Transaksi\s*(?:Rp\.?)?\s*([\d.,]+)/i);
  let nominalAmount = extractAmountFromMatch(/Nominal(?:\s*Transfer|\s*Transaksi)?\s*(?:Rp\.?)?\s*([\d.,]+)/i);
  let fee = extractAmountFromMatch(/Biaya\s*Transaksi\s*(?:Rp\.?)?\s*([\d.,]+)/i);

  if (totalAmount === 0 && nominalAmount > 0) {
    totalAmount = nominalAmount + fee;
  }
  if (nominalAmount === 0 && totalAmount > 0) {
    nominalAmount = totalAmount - fee;
  }

  // Fallback scan for any Indonesian Rupiah figure
  if (totalAmount === 0) {
    const fallbackRp = ocrText.match(/Rp\s*([\d.,]+)/i);
    if (fallbackRp) {
      totalAmount = parseInt(fallbackRp[1].replace(/\./g, ''), 10) || 50000;
      nominalAmount = totalAmount;
    }
  }

  // 4. Extract Keterangan / Notes (e.g., "Jemput Nadya", "Lunasin CC", "Tambahan")
  let notes = '';
  for (let i = 0; i < lines.length; i++) {
    if (/Keterangan\s*Transaksi/i.test(lines[i]) && lines[i + 1]) {
      if (!lines[i + 1].toLowerCase().includes('biaya transaksi termasuk')) {
        notes = lines[i + 1];
      }
      break;
    }
  }

  // 5. Extract Reference Number
  let refNo = 'MAN-' + Math.floor(100000 + Math.random() * 900000);
  const refMatch = ocrText.match(/(?:No\.?\s*Ref(?:erensi)?(?:\s*QRIS|\s*BI\s*Fast)?|No\.?\s*Ref\.)\s*[:.]?\s*([A-Za-z0-9]+)/i);
  if (refMatch && refMatch[1].length >= 6) {
    refNo = refMatch[1];
  }

  // 6. Intelligent Category Mapping
  let category = 'groceries';
  const textToCheck = `${recipient} ${notes} ${fullText}`.toLowerCase();

  if (textToCheck.includes('kopi') || textToCheck.includes('resto') || textToCheck.includes('cafe') || textToCheck.includes('makan') || textToCheck.includes('bakso') || textToCheck.includes('dhawa')) {
    category = 'dining';
  } else if (textToCheck.includes('jemput') || textToCheck.includes('sekolah') || textToCheck.includes('nadya') || textToCheck.includes('spp') || textToCheck.includes('les')) {
    category = 'transport';
  } else if (textToCheck.includes('tokopedia') || textToCheck.includes('pln') || textToCheck.includes('listrik') || textToCheck.includes('pdam') || textToCheck.includes('wifi') || textToCheck.includes('indihome')) {
    category = 'bills';
  } else if (textToCheck.includes('gopay') || textToCheck.includes('ovo') || textToCheck.includes('shopeepay') || textToCheck.includes('dana')) {
    category = 'groceries';
  }

  // 7. Payer
  let payer = defaultUser;
  if (/IDA BAGUS ANOM/i.test(ocrText)) {
    payer = 'Anom';
  }

  return {
    source,
    title: notes || recipient,
    recipient,
    amount: nominalAmount > 0 ? nominalAmount : totalAmount,
    fee,
    total: totalAmount > 0 ? totalAmount : 50000,
    category,
    payer,
    date: new Date().toISOString(),
    refNo,
    notes: notes || `Scan dari ${source}`
  };
}
export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentUser, setCurrentUser] = useState('Anom');
  
  // Persistent transactions & categories
  const [transactions, setTransactions] = useState(() => {
    const saved = localStorage.getItem('family_transactions');
    return saved ? JSON.parse(saved) : INITIAL_TRANSACTIONS;
  });
  const [categories, setCategories] = useState(() => {
    const saved = localStorage.getItem('family_categories');
    return saved ? JSON.parse(saved) : DEFAULT_CATEGORIES;
  });

  // Calculate dynamic total target from sum of categories
  const totalMonthlyBudget = categories.reduce((sum: number, c: any) => sum + (Number(c.allocated) || 0), 0);

  // Budget Editing States
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [editCategoriesList, setEditCategoriesList] = useState(categories);
  
  // OCR Scan Simulator State
  const [scannedImage, setScannedImage] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [scanStep, setScanStep] = useState('idle'); // 'idle', 'preview', 'reviewed'
  const fileInputRef = useRef(null);

  // Manual Quick Add Modal
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({
    title: '',
    recipient: '',
    amount: '',
    fee: '0',
    category: 'groceries',
    payer: 'Anom',
    date: new Date().toISOString().slice(0, 10),
    notes: ''
  });

  // Filter states
  const [filterMonth, setFilterMonth] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPayer, setFilterPayer] = useState('all');
  const [toastMsg, setToastMsg] = useState('');

  const showNotification = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3500);
  };

  // Currency Formatter
  const formatIDR = (val) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(val || 0);
  };

  // Format Date Pretty
  const formatDatePretty = (isoStr) => {
    if (!isoStr) return '-';
    const d = new Date(isoStr);
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  // Financial Calculations
  const metrics = useMemo(() => {
    const totalSpent = transactions.reduce((acc, curr) => acc + curr.total, 0);
    const totalBudget = categories.reduce((acc, curr) => acc + curr.budget, 0);
    const remainingBudget = totalBudget - totalSpent;
    
    const anomSpent = transactions
      .filter(t => t.payer === 'Anom')
      .reduce((acc, curr) => acc + curr.total, 0);
    
    const wifeSpent = transactions
      .filter(t => t.payer === 'Wife')
      .reduce((acc, curr) => acc + curr.total, 0);

    // Spend by category
    const categorySpend = {};
    categories.forEach(c => { categorySpend[c.id] = 0; });
    transactions.forEach(t => {
      if (categorySpend[t.category] !== undefined) {
        categorySpend[t.category] += t.total;
      }
    });

    return {
      totalSpent,
      totalBudget,
      remainingBudget,
      anomSpent,
      wifeSpent,
      categorySpend,
      budgetUsedPct: Math.round((totalSpent / totalBudget) * 100)
    };
  }, [transactions, categories]);

  // Real OCR receipt upload using Tesseract.js & Mandiri Regex Parser
  const handleFileUpload = async (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show image preview immediately
    const reader = new FileReader();
    reader.onload = () => {
      setScannedImage(reader.result as string);
    };
    reader.readAsDataURL(file);

    setIsAnalyzing(true);
    setScanStep('preview');

    try {
      // 1. Extract text from uploaded image
      const { data: { text } } = await Tesseract.recognize(file, 'ind+eng', {
        logger: (m) => console.log(m.status, m.progress),
      });

      console.log('--- OCR RAW TEXT ---', text);

      // 2. Parse details using the Mandiri format parser
      const parsedData = parseLivinReceipt(text, currentUser);

      setExtractedData(parsedData);
      setScanStep('reviewed');
      showNotification(`Scanned: ${parsedData.title} (Rp ${parsedData.total.toLocaleString('id-ID')})`);
    } catch (err) {
      console.error('OCR Error:', err);
      // Fallback if image resolution or blur prevents recognition
      setExtractedData({
        refNo: `MAN-${Date.now().toString().slice(-6)}`,
        title: 'Pengeluaran Mandiri',
        recipient: 'Penerima Transfer',
        amount: 0,
        fee: 0,
        total: 0,
        payer: currentUser,
        category: 'dining',
        date: new Date().toISOString(),
        source: 'Livin by Mandiri',
        notes: 'Periksa kembali nilai nominal'
      });
      setScanStep('reviewed');
      showNotification('Gagal membaca gambar secara otomatis. Silakan cek data.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Demo shortcut button
  const triggerReceiptAnalysis = (customTemplate = 'livin') => {
    setIsAnalyzing(true);
    setScanStep('preview');

    setTimeout(() => {
      setIsAnalyzing(false);
      setExtractedData({
        refNo: '611112380519',
        title: 'Kopi Reman Dhawa',
        recipient: 'Kopi Reman Dhawa',
        amount: 20000,
        fee: 0,
        total: 20000,
        payer: currentUser,
        category: 'dining',
        date: new Date().toISOString(),
        source: 'Livin QRIS',
        notes: 'Scan QRIS Kopi'
      });
      setScanStep('reviewed');
      showNotification('Loaded sample transaction');
    }, 1000);
  };
  // Confirm Scanned Expense into Ledger
  const confirmScannedExpense = () => {
    if (!extractedData) return;
    const newTx = {
      ...extractedData,
      id: `tx-${Date.now()}`
    };
    setTransactions([newTx, ...transactions]);
    setScannedImage(null);
    setExtractedData(null);
    setScanStep('idle');
    setActiveTab('ledger');
    showNotification('Receipt confirmed and logged to Shared Ledger!');
  };

  // Save Manual Form
  const handleSaveManual = (e) => {
    e.preventDefault();
    const amountNum = parseFloat(manualForm.amount) || 0;
    const feeNum = parseFloat(manualForm.fee) || 0;
    if (amountNum <= 0) return;

    const newTx = {
      id: `tx-${Date.now()}`,
      refNo: `MANUAL-${Date.now().toString().slice(-6)}`,
      title: manualForm.title || 'Family Expense',
      recipient: manualForm.recipient || '-',
      payer: manualForm.payer,
      amount: amountNum,
      fee: feeNum,
      total: amountNum + feeNum,
      category: manualForm.category,
      date: manualForm.date,
      source: 'Manual Input',
      notes: manualForm.notes
    };

    setTransactions([newTx, ...transactions]);
    setShowManualModal(false);
    setManualForm({
      title: '',
      recipient: '',
      amount: '',
      fee: '0',
      category: 'groceries',
      payer: currentUser,
      date: new Date().toISOString().slice(0, 10),
      notes: ''
    });
    showNotification('Expense successfully added!');
  };

  // Delete transaction
  const deleteTransaction = (id) => {
    setTransactions(transactions.filter(t => t.id !== id));
    showNotification('Transaction removed.');
  };

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Ref No,Date,Title,Recipient,Category,Payer,Amount,Fee,Total,Notes\n'];
    const rows = transactions.map(t => 
      `"${t.refNo}","${t.date}","${t.title}","${t.recipient}","${t.category}","${t.payer}",${t.amount},${t.fee},${t.total},"${t.notes || ''}"\n`
    );
    const blob = new Blob([...headers, ...rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Family_Expenses_Evaluation_${new Date().toISOString().slice(0, 7)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('Exported CSV for monthly evaluation!');
  };

  // Filtered transactions for the Ledger tab
  const filteredTransactions = transactions.filter(t => {
    const matchCategory = filterCategory === 'all' || t.category === filterCategory;
    const matchPayer = filterPayer === 'all' || t.payer === filterPayer;
    return matchCategory && matchPayer;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex justify-center items-start font-sans antialiased sm:p-4">
      {/* Phone container mockup */}
      <div className="w-full max-w-md bg-slate-950 min-h-screen sm:min-h-[860px] sm:rounded-3xl sm:border sm:border-slate-800 shadow-2xl flex flex-col relative overflow-hidden pb-20">
        
        {/* Top Header Bar */}
        <header className="px-5 pt-5 pb-4 bg-slate-900/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-30 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                OurFamily Budget
                <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Shared</span>
              </h1>
              <p className="text-xs text-slate-400">November 2026 Evaluation</p>
            </div>
          </div>

          {/* User Profile Selector (Toggle who is logging) */}
          <div className="flex items-center bg-slate-800 p-1 rounded-full border border-slate-700/60 text-xs">
            <button 
              onClick={() => setCurrentUser('Anom')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                currentUser === 'Anom' 
                  ? 'bg-blue-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              🧔 Anom
            </button>
            <button 
              onClick={() => setCurrentUser('Wife')}
              className={`px-2.5 py-1 rounded-full font-medium transition-all ${
                currentUser === 'Wife' 
                  ? 'bg-pink-600 text-white shadow-sm' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              👩 Wife
            </button>
          </div>
        </header>

        {/* Floating Notification */}
        {toastMsg && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white text-xs font-medium px-4 py-2.5 rounded-full shadow-lg flex items-center space-x-2 animate-bounce">
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMsg}</span>
          </div>
        )}

        {/* Dynamic Body Content */}
        <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          
          {/* TAB 1: DASHBOARD OVERVIEW */}
          {activeTab === 'dashboard' && (
            <div className="space-y-4">
              {/* Family Spending Card */}
              <div className="bg-gradient-to-br from-slate-800/90 to-slate-900 border border-slate-700/70 rounded-2xl p-4 shadow-xl">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Total Shared Spent</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Remaining: {formatIDR(metrics.remainingBudget)}
                  </span>
                </div>
                <div className="text-2xl font-black text-white tracking-tight mb-2">
                  {formatIDR(metrics.totalSpent)}
                </div>

                {/* Overall Budget Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] text-slate-400">
                    <span>Monthly Target: {formatIDR(metrics.totalBudget)}</span>
                    <span className="font-semibold text-slate-200">{metrics.budgetUsedPct}% Used</span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-700/50">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        metrics.budgetUsedPct > 90 ? 'bg-rose-500' : metrics.budgetUsedPct > 70 ? 'bg-amber-500' : 'bg-blue-500'
                      }`}
                      style={{ width: `${Math.min(metrics.budgetUsedPct, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Spender Breakdown (Couple distribution) */}
                <div className="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-slate-700/50 text-xs">
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <div className="text-slate-400 flex items-center justify-between">
                      <span>🧔 Anom Paid</span>
                      <span className="text-[10px] text-blue-400 font-bold">{Math.round((metrics.anomSpent / (metrics.totalSpent || 1)) * 100)}%</span>
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">{formatIDR(metrics.anomSpent)}</div>
                  </div>
                  <div className="bg-slate-900/60 p-2.5 rounded-xl border border-slate-800">
                    <div className="text-slate-400 flex items-center justify-between">
                      <span>👩 Wife Paid</span>
                      <span className="text-[10px] text-pink-400 font-bold">{Math.round((metrics.wifeSpent / (metrics.totalSpent || 1)) * 100)}%</span>
                    </div>
                    <div className="text-sm font-bold text-white mt-0.5">{formatIDR(metrics.wifeSpent)}</div>
                  </div>
                </div>
              </div>

              {/* Quick Actions (Scan Livin Receipt / Manual Add) */}
              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={() => {
                    setActiveTab('scan');
                  }}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white p-3 rounded-2xl flex flex-col items-center justify-center text-center shadow-lg shadow-blue-600/20 border border-blue-400/20 group"
                >
                  <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xs font-bold">Scan Bank Receipt</span>
                  <span className="text-[10px] text-blue-200">Livin' / BCA / QRIS</span>
                </button>

                <button
                  onClick={() => setShowManualModal(true)}
                  className="bg-slate-800/90 hover:bg-slate-800 text-white p-3 rounded-2xl flex flex-col items-center justify-center text-center border border-slate-700/60 group"
                >
                  <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="text-xs font-bold">Manual Input</span>
                  <span className="text-[10px] text-slate-400">Cash / quick note</span>
                </button>
              </div>

              {/* Top Monthly Spending Categories */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <PieChart className="w-4 h-4 text-blue-400" />
                Category Allocation
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditCategoriesList(categories);
                    setIsEditingBudget(true);
                  }}
                  className="text-xs bg-indigo-600/30 border border-indigo-500/50 hover:bg-indigo-600/50 text-indigo-300 font-medium px-2.5 py-1 rounded-lg transition-colors"
                >
                  ✎ Edit
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('budget')}
                  className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-0.5"
                >
                  Details <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

                <div className="space-y-2.5">
                  {categories.slice(0, 4).map((cat) => {
                    const spent = metrics.categorySpend[cat.id] || 0;
                    const pct = Math.round((spent / cat.budget) * 100);
                    return (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-slate-300 flex items-center gap-1.5">
                            <span>{cat.icon}</span> {cat.name}
                          </span>
                          <span className="font-semibold text-slate-200">
                            {formatIDR(spent)} <span className="text-slate-500 font-normal">/ {formatIDR(cat.budget)}</span>
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              pct > 100 ? 'bg-rose-500' : pct > 80 ? 'bg-amber-400' : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Recent Transactions List Snippet */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-emerald-400" />
                    Latest Transactions
                  </h3>
                  <button 
                    onClick={() => setActiveTab('ledger')} 
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center font-medium"
                  >
                    View All ({transactions.length}) <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="divide-y divide-slate-800/80">
                  {transactions.slice(0, 3).map((tx) => (
                    <div key={tx.id} className="py-2.5 flex items-center justify-between first:pt-0 last:pb-0">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-base">
                          {categories.find(c => c.id === tx.category)?.icon || '💳'}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-100 leading-tight">{tx.title}</p>
                          <div className="flex items-center gap-1.5 text-[10px] text-slate-400 mt-0.5">
                            <span className={`font-semibold ${tx.payer === 'Anom' ? 'text-blue-400' : 'text-pink-400'}`}>
                              {tx.payer}
                            </span>
                            <span>•</span>
                            <span>{formatDatePretty(tx.date)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs font-bold text-slate-100">{formatIDR(tx.total)}</div>
                        {tx.fee > 0 && (
                          <div className="text-[10px] text-slate-500">+Fee {formatIDR(tx.fee)}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: RECEIPT SCANNER & OCR PARSER */}
          {activeTab === 'scan' && (
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-bold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-blue-400" />
                    Receipt OCR Auto-Parser
                  </h2>
                  <span className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">
                    AI Auto-Detect
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4 leading-relaxed">
                  Drop or select a digital transfer screenshot (Livin' by Mandiri, BCA, or QRIS). The parser will automatically extract the recipient, fee, total amount, and notes.
                </p>

                {/* Upload or Simulator box */}
                <div className="border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 rounded-2xl p-6 text-center bg-slate-950/60 transition-colors">
                  <input 
                    type="file" 
                    accept="image/*" 
                    ref={fileInputRef} 
                    onChange={handleFileUpload} 
                    className="hidden" 
                  />
                  
                  <div className="w-12 h-12 mx-auto rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mb-3">
                    <Upload className="w-6 h-6" />
                  </div>
                  <h4 className="text-xs font-bold text-slate-200">Upload Transfer Screenshot</h4>
                  <p className="text-[11px] text-slate-400 mt-1 mb-4">PNG, JPG, or PDF snapshot from mobile banking</p>

                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-xl border border-slate-700 flex items-center justify-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" /> Choose from Phone
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerReceiptAnalysis('livin')}
                      className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-1.5"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Try User's Livin' Receipt
                    </button>
                  </div>
                </div>
              </div>

              {/* Processing Spinner */}
              {isAnalyzing && (
                <div className="bg-slate-900 border border-blue-500/30 rounded-2xl p-6 text-center space-y-3">
                  <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-semibold text-blue-400">Extracting receipt fields with Vision OCR...</p>
                  <p className="text-[11px] text-slate-400">Reading: Recipient, Nominal, Biaya Transaksi, and Keterangan</p>
                </div>
              )}

              {/* Extracted Result Review Card */}
              {extractedData && !isAnalyzing && (
                <div className="bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/30 rounded-2xl p-4 shadow-xl space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span className="text-xs font-bold text-white">Extracted Transfer Data</span>
                    </div>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">
                      {extractedData.source}
                    </span>
                  </div>

                  {/* Form fields ready for confirmation */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <label className="text-[10px] uppercase font-semibold text-slate-400">Transaction Title / Description</label>
                      <input 
                        type="text"
                        value={extractedData.title}
                        onChange={(e) => setExtractedData({...extractedData, title: e.target.value})}
                        className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400">Recipient</label>
                        <input 
                          type="text"
                          value={extractedData.recipient}
                          onChange={(e) => setExtractedData({...extractedData, recipient: e.target.value})}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400">Category Tag</label>
                        <select 
                          value={extractedData.category}
                          onChange={(e) => setExtractedData({...extractedData, category: e.target.value})}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                        >
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400">Transfer</label>
                        <input 
                          type="number"
                          value={extractedData.amount}
                          onChange={(e) => {
                            const amt = parseFloat(e.target.value) || 0;
                            setExtractedData({
                              ...extractedData, 
                              amount: amt, 
                              total: amt + extractedData.fee
                            });
                          }}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400">Admin Fee</label>
                        <input 
                          type="number"
                          value={extractedData.fee}
                          onChange={(e) => {
                            const fee = parseFloat(e.target.value) || 0;
                            setExtractedData({
                              ...extractedData, 
                              fee: fee, 
                              total: extractedData.amount + fee
                            });
                          }}
                          className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-slate-100 font-medium focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase font-semibold text-slate-400">Payer</label>
                        <div className="flex mt-1 bg-slate-950 border border-slate-800 rounded-xl p-0.5">
                          <button
                            type="button"
                            onClick={() => setExtractedData({...extractedData, payer: 'Anom'})}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${
                              extractedData.payer === 'Anom' ? 'bg-blue-600 text-white' : 'text-slate-400'
                            }`}
                          >
                            Anom
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtractedData({...extractedData, payer: 'Wife'})}
                            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${
                              extractedData.payer === 'Wife' ? 'bg-pink-600 text-white' : 'text-slate-400'
                            }`}
                          >
                            Wife
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center text-xs">
                      <div>
                        <span className="text-slate-400 text-[11px]">Total Deducted:</span>
                        <div className="text-base font-extrabold text-white">{formatIDR(extractedData.total)}</div>
                      </div>
                      <div className="text-right text-[10px] text-slate-400 font-mono">
                        Ref: {extractedData.refNo.slice(0, 14)}...
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setExtractedData(null)}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={confirmScannedExpense}
                      className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Confirm & Log to Ledger
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SHARED EXPENSE LEDGER */}
          {activeTab === 'ledger' && (
            <div className="space-y-3">
              {/* Filter controls */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                  <div className="flex items-center gap-1.5">
                    <Filter className="w-3.5 h-3.5 text-blue-400" />
                    Ledger Filters
                  </div>
                  <button 
                    onClick={exportToCSV}
                    className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20"
                  >
                    <Download className="w-3 h-3" /> Export CSV
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="text-[10px] text-slate-400 uppercase">Paid By</label>
                    <select 
                      value={filterPayer}
                      onChange={(e) => setFilterPayer(e.target.value)}
                      className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-xs"
                    >
                      <option value="all">Everyone (All)</option>
                      <option value="Anom">Anom only</option>
                      <option value="Wife">Wife only</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] text-slate-400 uppercase">Category</label>
                    <select 
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className="w-full mt-0.5 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-slate-200 text-xs"
                    >
                      <option value="all">All Categories</option>
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Transactions count summary */}
              <div className="flex justify-between items-center text-xs text-slate-400 px-1">
                <span>Showing {filteredTransactions.length} of {transactions.length} entries</span>
                <span>Sum: <strong className="text-white">{formatIDR(filteredTransactions.reduce((a, c) => a + c.total, 0))}</strong></span>
              </div>

              {/* Transaction list cards */}
              <div className="space-y-2">
                {filteredTransactions.length === 0 ? (
                  <div className="text-center py-10 bg-slate-900/50 rounded-2xl border border-slate-800">
                    <p className="text-xs text-slate-400">No transactions match your filter.</p>
                  </div>
                ) : (
                  filteredTransactions.map((tx) => (
                    <div 
                      key={tx.id} 
                      className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-3 flex flex-col space-y-2 transition-all"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-base shrink-0 mt-0.5">
                            {categories.find(c => c.id === tx.category)?.icon || '💳'}
                          </div>
                          <div>
                            <h4 className="text-xs font-bold text-white leading-tight">{tx.title}</h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">To: {tx.recipient}</p>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs font-extrabold text-white">{formatIDR(tx.total)}</div>
                          <span className={`inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded ${
                            tx.payer === 'Anom' 
                              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' 
                              : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'
                          }`}>
                            {tx.payer}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span>{formatDatePretty(tx.date)}</span>
                          <span>•</span>
                          <span>{tx.source}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {tx.notes && <span className="italic max-w-[140px] truncate">"{tx.notes}"</span>}
                          <button 
                            onClick={() => deleteTransaction(tx.id)}
                            className="text-slate-500 hover:text-rose-400 p-1"
                            title="Delete entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 4: MONTHLY BUDGET & EVALUATION */}
          {activeTab === 'budget' && (
            <div className="space-y-4">
              {/* Couple Settlement / Split summary */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-pink-400" />
                    Couple Split Evaluation
                  </h3>
                  <span className="text-[10px] text-slate-400">50/50 Baseline</span>
                </div>

                {/* Balance math */}
                {(() => {
                  const diff = metrics.anomSpent - metrics.wifeSpent;
                  const halfDiff = Math.abs(diff) / 2;
                  return (
                    <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs space-y-2">
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Anom total contribution:</span>
                        <span className="font-semibold text-white">{formatIDR(metrics.anomSpent)}</span>
                      </div>
                      <div className="flex justify-between items-center text-slate-300">
                        <span>Wife total contribution:</span>
                        <span className="font-semibold text-white">{formatIDR(metrics.wifeSpent)}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-emerald-400 font-semibold">
                        <span>Equalizer recommendation:</span>
                        <span>
                          {diff > 0 
                            ? `Wife refunds Anom ${formatIDR(halfDiff)}` 
                            : diff < 0 
                            ? `Anom refunds Wife ${formatIDR(halfDiff)}` 
                            : 'Contributions are perfectly equal!'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Category Budgets vs Actual Spend */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Category Thresholds
                    </h3>
                    <p className="text-[11px] text-slate-400">Green &lt;75% • Amber 75-99% • Red &gt;100%</p>
                  </div>
                  <button
                    onClick={exportToCSV}
                    className="p-2 bg-slate-800 text-blue-400 hover:text-blue-300 rounded-xl border border-slate-700"
                    title="Export for Spreadsheet Review"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-4">
                  {categories.map((cat) => {
                    const spent = metrics.categorySpend[cat.id] || 0;
                    const pct = Math.round((spent / cat.budget) * 100);
                    const isOver = spent > cat.budget;

                    return (
                      <div key={cat.id} className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-2">
                        <div className="flex justify-between items-center text-xs">
                          <div className="flex items-center space-x-2">
                            <span className="text-base">{cat.icon}</span>
                            <span className="font-bold text-white">{cat.name}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            pct >= 100 
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' 
                              : pct >= 75 
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' 
                              : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          }`}>
                            {pct}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              pct >= 100 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-400' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>

                        <div className="flex justify-between items-center text-[11px] text-slate-400">
                          <span>Spent: <strong className="text-slate-200">{formatIDR(spent)}</strong></span>
                          <span>Budget Cap: <strong className="text-slate-200">{formatIDR(cat.budget)}</strong></span>
                        </div>

                        {isOver && (
                          <div className="text-[10px] text-rose-400 flex items-center gap-1 bg-rose-500/10 p-1.5 rounded-lg border border-rose-500/20">
                            <AlertTriangle className="w-3 h-3" />
                            Over budget by {formatIDR(spent - cat.budget)}! Review for next month.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Monthly Review Action Note */}
              <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/30 border border-blue-500/20 rounded-2xl p-4 text-xs text-slate-300 space-y-2">
                <div className="font-bold text-white flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-blue-400" />
                  Monthly Evaluation Checklist
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400 text-[11px]">
                  <li>Check school pickup/transport fees against the 2.5jt limit.</li>
                  <li>Verify grocery receipts have no unaccounted impulse purchases.</li>
                  <li>Export ledger to CSV if you keep a permanent family spreadsheet.</li>
                </ul>
              </div>
            </div>
          )}
        </main>

        {/* MANUAL ADD MODAL */}
        {showManualModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Add Manual Expense
                </h3>
                <button 
                  onClick={() => setShowManualModal(false)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveManual} className="space-y-3 text-xs">
                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Description / Items</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Toko Kelontong, Sayur pagi"
                    value={manualForm.title}
                    onChange={(e) => setManualForm({...manualForm, title: e.target.value})}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Amount (Rp)</label>
                    <input 
                      type="number" 
                      required
                      placeholder="e.g. 150000"
                      value={manualForm.amount}
                      onChange={(e) => setManualForm({...manualForm, amount: e.target.value})}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Admin Fee (Rp)</label>
                    <input 
                      type="number" 
                      placeholder="0"
                      value={manualForm.fee}
                      onChange={(e) => setManualForm({...manualForm, fee: e.target.value})}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Category</label>
                    <select 
                      value={manualForm.category}
                      onChange={(e) => setManualForm({...manualForm, category: e.target.value})}
                      className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                    >
                      {categories.map(c => (
                        <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-semibold text-slate-400">Who Paid?</label>
                    <div className="flex mt-1 bg-slate-950 border border-slate-800 rounded-xl p-0.5">
                      <button
                        type="button"
                        onClick={() => setManualForm({...manualForm, payer: 'Anom'})}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${
                          manualForm.payer === 'Anom' ? 'bg-blue-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Anom
                      </button>
                      <button
                        type="button"
                        onClick={() => setManualForm({...manualForm, payer: 'Wife'})}
                        className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold ${
                          manualForm.payer === 'Wife' ? 'bg-pink-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Wife
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-semibold text-slate-400">Notes (Optional)</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Pembayaran cash"
                    value={manualForm.notes}
                    onChange={(e) => setManualForm({...manualForm, notes: e.target.value})}
                    className="w-full mt-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowManualModal(false)}
                    className="px-4 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20"
                  >
                    Save Expense
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Sticky Mobile Bottom Navigation Bar */}
        <nav className="absolute bottom-0 inset-x-0 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/80 px-2 py-2 flex items-center justify-around z-40">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'dashboard' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Wallet className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Overview</span>
          </button>

          <button
            onClick={() => setActiveTab('ledger')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'ledger' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Receipt className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Ledger</span>
          </button>

          {/* Center Scan Button Accent */}
          <button
            onClick={() => setActiveTab('scan')}
            className="flex flex-col items-center -mt-5"
          >
            <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/30 border-2 border-slate-950 active:scale-95 transition-transform">
              <Camera className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-bold text-blue-400 mt-1">Scan OCR</span>
          </button>

          <button
            onClick={() => setActiveTab('budget')}
            className={`flex flex-col items-center py-1 px-3 rounded-xl transition-colors ${
              activeTab === 'budget' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <PieChart className="w-5 h-5" />
            <span className="text-[10px] font-medium mt-1">Budget</span>
          </button>
        </nav>

      </div>
    {/* Edit Budget & Category Allocations Modal */}
      {isEditingBudget && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-semibold text-white">Adjust Category Budgets</h3>
                <p className="text-xs text-slate-400">Total monthly target updates automatically</p>
              </div>
              <button 
                type="button"
                onClick={() => setIsEditingBudget(false)}
                className="text-slate-400 hover:text-white text-lg px-2"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
              {editCategoriesList.map((cat: any, idx: number) => (
                <div key={cat.id || idx} className="bg-slate-800/70 p-3 rounded-xl border border-slate-700/60 flex items-center justify-between gap-3">
                  <div className="truncate flex-1">
                    <p className="text-xs font-medium text-white truncate">{cat.name}</p>
                    <p className="text-[10px] text-slate-400">{cat.id}</p>
                  </div>
                  <div className="flex items-center gap-1.5 w-44">
                    <span className="text-xs text-slate-400">Rp</span>
                    <input
                      type="number"
                      step="50000"
                      value={cat.allocated}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value));
                        const updated = [...editCategoriesList];
                        updated[idx] = { ...updated[idx], allocated: val };
                        setEditCategoriesList(updated);
                      }}
                      className="w-full bg-slate-900 border border-slate-700 focus:border-indigo-500 rounded-lg px-2.5 py-1.5 text-right text-xs text-white font-mono outline-none"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-400 font-medium">New Total Budget:</span>
              <span className="text-sm font-bold text-emerald-400 font-mono">
                Rp {editCategoriesList.reduce((sum: number, c: any) => sum + (Number(c.allocated) || 0), 0).toLocaleString('id-ID')}
              </span>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsEditingBudget(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setCategories(editCategoriesList);
                  localStorage.setItem('family_categories', JSON.stringify(editCategoriesList));
                  setIsEditingBudget(false);
                  showNotification('Monthly budget targets updated successfully!');
                }}
                className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-xl transition shadow-lg shadow-indigo-600/30"
              >
                Save Budget
              </button>
            </div>
          </div>
        </div>
      )}</div>
  );
}