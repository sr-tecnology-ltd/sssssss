import React, { useState, useEffect, useRef } from 'react';
import { 
  motion, 
  AnimatePresence 
} from 'motion/react';
import { 
  Wallet, 
  History, 
  Plus, 
  Send, 
  RefreshCcw, 
  Copy, 
  ChevronRight, 
  ShieldCheck, 
  Smartphone, 
  ExternalLink, 
  AlertCircle, 
  Check, 
  Loader2, 
  LogOut, 
  User as UserIcon, 
  Zap, 
  Key as KeyIcon,
  MessageSquare,
  Gift,
  Sparkles,
  Lock,
  Unlock,
  Users,
  SendHorizonal,
  X,
  PlusCircle,
  AlertTriangle,
  BadgeAlert,
  Settings,
  Download,
  Menu,
  Minus,
  Upload
} from 'lucide-react';
import { db, auth, logOut as firebaseLogOut } from './lib/firebase';
import { 
  collection, 
  doc, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  query, 
  where, 
  orderBy, 
  getDocs,
  limit,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword,
  onAuthStateChanged
} from 'firebase/auth';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

const UPI_ID = "srpay@ybl";
const SUPPORT_LINK = "https://t.me/srsaportbot";
const OFFICIAL_CHANNEL = "https://t.me/SRGatewayBot";
const SUPPORT_EMAIL = "sr.notify.hub@gmail.com";

// Tailwind classes helper
function cn(...classes: any[]) {
  return classes.filter(Boolean).join(' ');
}

const getTransactionCategory = (type: string) => {
  const t = (type || '').toLowerCase();
  
  // Credits
  if (
    t === 'deposit' || 
    t === 'api-received' || 
    t === 'wallet-transfer-received' || 
    t === 'transfer-received' || 
    t === 'giftcode-claim' || 
    t === 'lifafa-scratch'
  ) {
    let label = "Credit";
    if (t === 'deposit') label = "Deposit";
    else if (t === 'api-received') label = "API Received";
    else if (t === 'wallet-transfer-received' || t === 'transfer-received') label = "P2P Credit";
    else if (t === 'giftcode-claim') label = "Gift Code Clm";
    else if (t === 'lifafa-scratch') label = "Lifafa Bonus";
    
    return {
      isCredit: true,
      label,
      colorClass: 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 shadow-[0_0_12px_rgba(16,185,129,0.25)]',
      textColor: 'text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
    };
  }

  // Debits
  let label = "Debit";
  if (t === 'withdrawal' || t === 'payout') label = "Withdrawal";
  else if (t === 'debit') label = "Admin Debit";
  else if (t === 'api-payout') label = "API Payout";
  else if (t === 'wallet-transfer-sent' || t === 'transfer-sent') label = "P2P Debit";
  
  return {
    isCredit: false,
    label,
    colorClass: 'bg-red-500/10 text-red-500 border border-red-500/20 shadow-[0_0_12px_rgba(239,68,68,0.25)]',
    textColor: 'text-red-500 shadow-[0_0_10px_rgba(239,68,68,0.3)]'
  };
};

const formatTimestamp = (ts: any) => {
  if (!ts) return "";
  try {
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (ts.seconds) {
      return new Date(ts.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } catch (e) {
    console.warn("Date parse error", e);
  }
  return "";
};

const formatDateOnly = (ts: any) => {
  if (!ts) return "Syncing";
  try {
    if (typeof ts.toDate === 'function') {
      return ts.toDate().toLocaleDateString();
    }
    if (ts.seconds) {
      return new Date(ts.seconds * 1000).toLocaleDateString();
    }
    const d = new Date(ts);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString();
    }
  } catch (e) {
    console.warn("DateOnly parse fail", e);
  }
  return "Recent";
};

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('home');
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showTermsModal, setShowTermsModal] = useState<boolean>(false);
  const [isAdminPathActive, setIsAdminPathActive] = useState<boolean>(false);
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<any>(() => {
    try {
      const cached = localStorage.getItem('sr_user_data');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState<boolean>(true);
  const [processing, setProcessing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Authentication Fields (Mobile and password only)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [mobileNumber, setMobileNumber] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  // Transactions State
  const [transactions, setTransactions] = useState<any[]>([]);

  // MPIN Cluster Locks
  const [pin, setPin] = useState<string>('');
  const [showPinModal, setShowPinModal] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<any>(null);
  const [forceMpinSetup, setForceMpinSetup] = useState<boolean>(false);
  const [mpinInputVal, setMpinInputVal] = useState<string>('');

  // Form Field Inputs
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositUtr, setDepositUtr] = useState<string>('');
  
  const [payoutNumber, setPayoutNumber] = useState<string>('');
  const [payoutAmount, setPayoutAmount] = useState<string>('');
  const [payoutComment, setPayoutComment] = useState<string>('');
  
  const [bulkData, setBulkData] = useState<string>('');

  // --- NEW FEATURES STATES ---
  // Wallet to Wallet Transfer
  const [transferMobile, setTransferMobile] = useState<string>('');
  const [transferAmount, setTransferAmount] = useState<string>('');
  const [transferMpin, setTransferMpin] = useState<string>('');
  const [showTransferModal, setShowTransferModal] = useState<boolean>(false);

  // Gift Codes System
  const [giftCodeInput, setGiftCodeInput] = useState<string>('');
  const [createGiftAmount, setCreateGiftAmount] = useState<string>('');
  const [createGiftLimit, setCreateGiftLimit] = useState<string>('1');
  const [createGiftHours, setCreateGiftHours] = useState<string>('24');
  const [createGiftMpin, setCreateGiftMpin] = useState<string>('');
  const [showCreateGiftModal, setShowCreateGiftModal] = useState<boolean>(false);

  // SR X Lifafa System
  const [lifafaIdInput, setLifafaIdInput] = useState<string>('');
  const [createLifafaAmount, setCreateLifafaAmount] = useState<string>('');
  const [createLifafaLimit, setCreateLifafaLimit] = useState<string>('5');
  const [createLifafaType, setCreateLifafaType] = useState<'fixed' | 'random'>('fixed');
  const [createLifafaChannel, setCreateLifafaChannel] = useState<string>('');
  const [createLifafaMpin, setCreateLifafaMpin] = useState<string>('');
  const [showCreateLifafaModal, setShowCreateLifafaModal] = useState<boolean>(false);

  // --- USER PROMOS, TRACKING BOARD & EXTRA WITHDRAWAL OPTIONS ---
  const [userCreatedCodes, setUserCreatedCodes] = useState<any[]>([]);
  const [showPromoBoard, setShowPromoBoard] = useState<boolean>(false);
  const [withdrawalMethod, setWithdrawalMethod] = useState<'upi' | 'qr' | 'number'>('upi');
  const [withdrawalDetails, setWithdrawalDetails] = useState<string>('');
  const [withdrawalQrCode, setWithdrawalQrCode] = useState<string>('');

  // Live Chat system
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // --- HIDDEN ADMIN PANEL STATE ---
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminTransactions, setAdminTransactions] = useState<any[]>([]);
  const [adminApiLogs, setAdminApiLogs] = useState<any[]>([]);
  const [selectedChatUser, setSelectedChatUser] = useState<any>(null);
  const [adminChatInput, setAdminChatInput] = useState<string>('');
  const [adminChats, setAdminChats] = useState<any[]>([]);
  const [adminBalanceInput, setAdminBalanceInput] = useState<Record<string, string>>({});
  const [adminDebitInput, setAdminDebitInput] = useState<Record<string, string>>({});

  // --- DYNAMIC LIVE GATEWAY CONFIGURATIONS & ALERTS ---
  const [gatewayConfig, setGatewayConfig] = useState<{
    upiId: string;
    telegramBotToken: string;
    telegramBotUsername: string;
    qrCode: string;
  }>({
    upiId: "srpay@ybl",
    telegramBotToken: "",
    telegramBotUsername: "SR_Gateway_Alert_Bot",
    qrCode: ""
  });

  const [activeUpiInput, setActiveUpiInput] = useState<string>('');
  const [activeBotTokenInput, setActiveBotTokenInput] = useState<string>('');
  const [activeBotUsernameInput, setActiveBotUsernameInput] = useState<string>('');
  const [activeQrCodeInput, setActiveQrCodeInput] = useState<string>('');

  const [showTelegramModal, setShowTelegramModal] = useState<boolean>(false);
  const [tempTelegramChatId, setTempTelegramChatId] = useState<string>('');
  const [depositScreenshot, setDepositScreenshot] = useState<string>('');
  const [expandedScreenshot, setExpandedScreenshot] = useState<string | null>(null);

  // Synchronize tempTelegramChatId when userData shifts
  useEffect(() => {
    if (userData?.telegramChatId) {
      setTempTelegramChatId(userData.telegramChatId);
    }
  }, [userData]);

  // --- Initialize App & Auto Routing detector ---
  useEffect(() => {
    // Dynamic Firestore global configuration listener
    const unsubGlobalConfig = onSnapshot(doc(db, 'settings', 'global'), (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        const conf = {
          upiId: d.upiId || "srpay@ybl",
          telegramBotToken: d.telegramBotToken || "",
          telegramBotUsername: d.telegramBotUsername || "SR_Gateway_Alert_Bot",
          qrCode: d.qrCode || ""
        };
        setGatewayConfig(conf);
        setActiveUpiInput(conf.upiId);
        setActiveBotTokenInput(conf.telegramBotToken);
        setActiveBotUsernameInput(conf.telegramBotUsername);
        setActiveQrCodeInput(conf.qrCode);
      }
    }, (err) => {
      console.warn("Global configuration load skipped or not permitted yet. Normal until login:", err.message);
    });

    // Check route immediately
    const handleUrlRouting = () => {
      const isSecretAdmin = window.location.pathname.includes('/sradmin1KJRD829') || window.location.hash.includes('/sradmin1KJRD829');
      setIsAdminPathActive(isSecretAdmin);
      if (isSecretAdmin) {
        setActiveTab('admin');
      } else {
        setActiveTab(prev => prev === 'admin' ? 'home' : prev);
      }
    };

    handleUrlRouting();
    window.addEventListener('hashchange', handleUrlRouting);
    
    // Auth Listener
    const unsubscribeAuth = onAuthStateChanged(auth, async (clientUser) => {
      if (clientUser) {
        setUser(clientUser);
        
        const token = localStorage.getItem('sr_token');
        let realUid = '';
        
        try {
          const cached = localStorage.getItem('sr_user_data');
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.uid) {
              realUid = parsed.uid;
              setUserData(parsed);
            }
          }
        } catch (err) {
          console.error("Cached profile load fail", err);
        }

        let unsubscribeUser: (() => void) | null = null;
        let unsubscribeTxns: (() => void) | null = null;
        let unsubscribeChats: (() => void) | null = null;
        let fallbackPollInterval: any = null;

        const startSubscriptions = (uid: string) => {
          if (unsubscribeUser) (unsubscribeUser as () => void)();
          if (unsubscribeTxns) (unsubscribeTxns as () => void)();
          if (unsubscribeChats) (unsubscribeChats as () => void)();
          if (fallbackPollInterval) clearInterval(fallbackPollInterval);

          let activeMobile = '';
          let isPollingActive = false;

          const triggerFallbackPolling = () => {
            if (isPollingActive) return;
            isPollingActive = true;
            console.log("⚠️ Activating secure background polling engine fallback due to direct sync security gates...");
            
            const pollData = async () => {
              const token = localStorage.getItem('sr_token');
              if (!token) return;
              try {
                const headers = { Authorization: `Bearer ${token}` };
                const [profileRes, txRes, chatRes] = await Promise.all([
                  axios.get('/api/auth/profile', { headers }),
                  axios.get('/api/user/transactions', { headers }),
                  axios.get('/api/user/chats', { headers })
                ]);
                
                if (profileRes.data.status === 'success' && profileRes.data.user) {
                  const d = profileRes.data.user;
                  setUserData(d);
                  localStorage.setItem('sr_user_data', JSON.stringify(d));
                  if (d.pin === null || d.pin === undefined) {
                    setForceMpinSetup(true);
                  } else {
                    setForceMpinSetup(false);
                  }
                }
                
                if (txRes.data.status === 'success' && txRes.data.transactions) {
                  setTransactions(txRes.data.transactions);
                }
                
                if (chatRes.data.status === 'success' && chatRes.data.chats) {
                  setChatMessages(chatRes.data.chats);
                }
              } catch (e) {
                console.warn("Secure polling fallback cycle aborted:", e);
              }
            };

            pollData();
            fallbackPollInterval = setInterval(pollData, 3000);
          };

          const docRef = doc(db, 'users', uid);
          unsubscribeUser = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
              const data = snap.data();
              setUserData(data);
              localStorage.setItem('sr_user_data', JSON.stringify(data));
              
              if (data.pin === null || data.pin === undefined) {
                setForceMpinSetup(true);
              } else {
                setForceMpinSetup(false);
              }

              if (data.mobile && data.mobile !== activeMobile) {
                activeMobile = data.mobile;
                
                if (unsubscribeTxns) (unsubscribeTxns as () => void)();
                if (unsubscribeChats) (unsubscribeChats as () => void)();

                const txnsQuery = query(
                  collection(db, 'transactions'),
                  where('mobile', '==', data.mobile),
                  limit(50)
                );
                unsubscribeTxns = onSnapshot(txnsQuery, (tSnap) => {
                  const list = tSnap.docs.map(tDoc => ({ id: tDoc.id, ...tDoc.data() }));
                  // Sort client-side of CJS server
                  list.sort((a: any, b: any) => {
                    const at = a.timestamp?.seconds || a.timestamp?._seconds || 0;
                    const bt = b.timestamp?.seconds || b.timestamp?._seconds || 0;
                    return bt - at;
                  });
                  setTransactions(list);
                }, (err) => {
                  console.warn("Direct Txns sync blocked. Activating API Polling...", err.message);
                  triggerFallbackPolling();
                });

                const chatQuery = query(
                  collection(db, 'chats'),
                  where('mobile', '==', data.mobile)
                );
                unsubscribeChats = onSnapshot(chatQuery, (cSnap) => {
                  const list = cSnap.docs.map(cDoc => ({ id: cDoc.id, ...cDoc.data() }));
                  list.sort((a: any, b: any) => {
                    const at = a.timestamp?.seconds || a.timestamp?._seconds || 0;
                    const bt = b.timestamp?.seconds || b.timestamp?._seconds || 0;
                    return at - bt;
                  });
                  setChatMessages(list);
                }, (err) => {
                  console.warn("Direct Chats sync blocked. Activating API Polling...", err.message);
                  triggerFallbackPolling();
                });
              }
            }
          }, (err) => {
            console.warn("Direct profile sync blocked. Activating API Polling...", err.message);
            triggerFallbackPolling();
          });
        };

        const fetchAndSubscribe = async () => {
          if (token) {
            try {
              const res = await axios.get('/api/auth/profile', {
                headers: { Authorization: `Bearer ${token}` }
              });
              if (res.data.status === 'success' && res.data.user) {
                const u = res.data.user;
                setUserData(u);
                localStorage.setItem('sr_user_data', JSON.stringify(u));
                if (u.uid) {
                  realUid = u.uid;
                  startSubscriptions(realUid);
                  setLoading(false);
                  return;
                }
              }
            } catch (err: any) {
              console.error("Failed loading user profile via API", err);
              if (err.response && err.response.status === 403) {
                localStorage.removeItem('sr_token');
                localStorage.removeItem('sr_user_data');
                await firebaseLogOut();
              }
            }
          }

          if (!realUid) {
            const email = clientUser.email || '';
            const mobile = email.split('@')[0];
            if (mobile) {
              try {
                const usersQuery = query(
                  collection(db, 'users'),
                  where('mobile', '==', mobile),
                  limit(1)
                );
                const snap = await getDocs(usersQuery);
                if (!snap.empty) {
                  const firstDoc = snap.docs[0];
                  realUid = firstDoc.id;
                  const d = firstDoc.data();
                  setUserData(d);
                  localStorage.setItem('sr_user_data', JSON.stringify(d));
                  startSubscriptions(realUid);
                }
              } catch (err) {
                console.error("Failed querying user fallback", err);
              }
            }
          }

          if (realUid) {
            startSubscriptions(realUid);
          }
          setLoading(false);
        };

        fetchAndSubscribe();

        return () => {
          if (fallbackPollInterval) clearInterval(fallbackPollInterval);
          if (unsubscribeUser) {
            try { unsubscribeUser(); } catch(e) {}
          }
          if (unsubscribeTxns) {
            try { unsubscribeTxns(); } catch(e) {}
          }
          if (unsubscribeChats) {
            try { unsubscribeChats(); } catch(e) {}
          }
        };
      } else {
        setUser(null);
        setUserData(null);
        localStorage.removeItem('sr_user_data');
        setTransactions([]);
        setChatMessages([]);
        setLoading(false);
      }
    });

    return () => {
      unsubGlobalConfig();
      unsubscribeAuth();
      window.removeEventListener('hashchange', handleUrlRouting);
    };
  }, []);

  // Sync scroll on chat
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // Handle ADMIN specific loaders
  useEffect(() => {
    if (activeTab === 'admin' && user) {
      // Load administrative models
      const loadAdminResources = async () => {
        const token = localStorage.getItem('sr_token');
        if (!token) return;
        try {
          const headers = { Authorization: `Bearer ${token}` };
          const usersRes = await axios.get('/api/admin/users', { headers });
          if (usersRes.data.status === 'success') {
            setAdminUsers(usersRes.data.users);
          }
          const txRes = await axios.get('/api/admin/transactions', { headers });
          if (txRes.data.status === 'success') {
            setAdminTransactions(txRes.data.transactions);
          }
          const logRes = await axios.get('/api/admin/apiLogs', { headers });
          if (logRes.data.status === 'success') {
            setAdminApiLogs(logRes.data.logs);
          }
          const chatRes = await axios.get('/api/admin/chats', { headers });
          if (chatRes.data.status === 'success') {
            setAdminChats(chatRes.data.chats);
          }
        } catch (e: any) {
          console.error("Admin Load Fail:", e);
        }
      };

      loadAdminResources();
      const interval = setInterval(loadAdminResources, 5000); // refresh admin dashboard every 5s
      return () => clearInterval(interval);
    }
  }, [activeTab, user]);

  // --- Auth Handlers using custom Secure Node layer ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mobileNumber || !password || (authMode === 'register' && !fullName)) {
      setError("Please fill all required login parameters.");
      return;
    }
    setProcessing(true);
    setError(null);

    try {
      const email = `${mobileNumber}@kingwallet.com`;
      if (authMode === 'register') {
        const res = await axios.post('/api/auth/register', { mobile: mobileNumber, fullName, password });
        if (res.data.status === 'success') {
          localStorage.setItem('sr_token', res.data.token);
          if (res.data.user) {
            localStorage.setItem('sr_user_data', JSON.stringify(res.data.user));
            setUserData(res.data.user);
          }
          // Authenticate client SDK to match security rules
          await createUserWithEmailAndPassword(auth, email, password);
          setSuccess("Welcome to SR GATEWAY IN! Set your secure MPIN.");
          setForceMpinSetup(true);
        } else {
          throw new Error(res.data.message);
        }
      } else {
        const res = await axios.post('/api/auth/login', { mobile: mobileNumber, password });
        if (res.data.status === 'success') {
          localStorage.setItem('sr_token', res.data.token);
          if (res.data.user) {
            localStorage.setItem('sr_user_data', JSON.stringify(res.data.user));
            setUserData(res.data.user);
          }
          // Authenticate client SDK
          await signInWithEmailAndPassword(auth, email, password);
          setSuccess("Security Handshake Accepted!");
          // Force MPIN Verification immediately
          setShowPinModal(true);
        } else {
          throw new Error(res.data.message);
        }
      }
    } catch (err: any) {
      console.error("Auth Fail:", err);
      let friendlyMsg = "Credential authentication failure.";
      if (err.response) {
        if (typeof err.response.data === 'string' && err.response.data.includes("<pre>")) {
          const match = err.response.data.match(/<pre>([\s\S]*?)<\/pre>/);
          friendlyMsg = match ? match[1].trim() : "Internal Server Crash (500)";
        } else if (typeof err.response.data === 'string' && err.response.data.trim().startsWith("<!DOCTYPE")) {
          friendlyMsg = "Internal Serverless Exception: Check your Vercel logs or firebase environment variables.";
        } else if (err.response.data?.message) {
          friendlyMsg = err.response.data.message;
        } else if (err.response.data) {
          friendlyMsg = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
        } else {
          friendlyMsg = `Server Error (${err.response.status || 500}). Please check Vercel Logs.`;
        }
      } else if (err.message) {
        friendlyMsg = err.message;
      }
      setError(friendlyMsg);
    } finally {
      setProcessing(false);
    }
  };

  const handleLogOut = async () => {
    localStorage.removeItem('sr_token');
    await firebaseLogOut();
    setActiveTab('home');
  };

  const fetchUserCreatedCodes = async () => {
    const token = localStorage.getItem('sr_token');
    if (!token) return;
    try {
      const res = await axios.get('/api/user/codes', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success' && res.data.codes) {
        setUserCreatedCodes(res.data.codes);
      }
    } catch (e) {
      console.error("Failed loading user hosted codes", e);
    }
  };

  const handleToggleCode = async (id: string, type: 'gift' | 'lifafa') => {
    const token = localStorage.getItem('sr_token');
    if (!token) return;
    setProcessing(true);
    try {
      const res = await axios.post('/api/user/codes/toggle', { id, type }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        fetchUserCreatedCodes();
        setSuccess(res.data.message);
        setTimeout(() => setSuccess(null), 1500);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed changing code status");
    } finally {
      setProcessing(false);
    }
  };

  // Poll User Promo Code Hostings (Tracking)
  useEffect(() => {
    if (!user) return;
    fetchUserCreatedCodes();
    const pTimer = setInterval(fetchUserCreatedCodes, 6000);
    return () => clearInterval(pTimer);
  }, [user]);

  // --- MPIN Logic Set & Validate ---
  const handleSetupMpin = async () => {
    if (mpinInputVal.length !== 6 || isNaN(Number(mpinInputVal))) {
      setError("MPIN must be a 6-digit numeric combination.");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/auth/mpin/set', { pin: mpinInputVal }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess("Secure MPIN setup completed successfully!");
        setForceMpinSetup(false);
        setMpinInputVal('');
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setProcessing(false);
    }
  };

  const triggerActionWithPin = (action: () => void) => {
    setPendingAction(() => action);
    setShowPinModal(true);
  };

  const verifyPin = async () => {
    if (pin.length !== 6) {
      setError("Please type your exact 6-digit MPIN");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/auth/mpin/verify', { pin }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setShowPinModal(false);
        setPin('');
        setSuccess("Passkey verified!");
        setTimeout(() => setSuccess(null), 1500);
        if (pendingAction) {
          pendingAction();
          setPendingAction(null);
        }
      } else {
        throw new Error(res.data.message);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.message || "Invalid passkey structure. Locked soon.");
      setPin('');
    } finally {
      setProcessing(false);
    }
  };

  // --- 1-Click QR Code Image Download Helper ---
  const downloadQRCode = () => {
    if (gatewayConfig.qrCode) {
      const downloadLink = document.createElement("a");
      downloadLink.href = gatewayConfig.qrCode;
      downloadLink.download = "sr_gateway_deposit_merchant_qr.png";
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      setSuccess("Static QR Code downloaded! Scan directly via Google Pay, PhonePe, or any UPI app.");
      return;
    }
    const svg = document.getElementById("deposit-qr-svg");
    if (!svg) {
      setError("QR display element missing.");
      return;
    }
    try {
      const svgString = new XMLSerializer().serializeToString(svg);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const blobURL = URL.createObjectURL(svgBlob);
      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 320;
        const context = canvas.getContext("2d");
        if (context) {
          // Fill background with crystal white for high-contrast scanning readability
          context.fillStyle = "#FFFFFF";
          context.fillRect(0, 0, 320, 320);
          context.drawImage(image, 15, 15, 290, 290);
          const png = canvas.toDataURL("image/png");
          const downloadLink = document.createElement("a");
          downloadLink.href = png;
          downloadLink.download = "sr_gateway_deposit_qr.png";
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
          setSuccess("QR Code image downloaded! Scan directly via Google Pay/PhonePe/Any UPI application.");
        }
      };
      image.src = blobURL;
    } catch (err: any) {
      console.error("QR download failed:", err);
      setError("Failed to export QR code image. Please take a manual screenshot.");
    }
  };

  // --- File Conversion helper to shrink user screenshots ---
  const processImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 450;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          setDepositScreenshot(compressed);
          setSuccess("Screenshot uploaded & prepared successfully! Press submit button below to lodge.");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // --- Funds Load / Deposits ---
  const handleDeposit = async () => {
    if (!depositAmount || !depositUtr || depositUtr.length !== 12) {
      setError("Provide deposit amount and a valid 12-digit UPI UTR");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      // Submits a pending request inside transactions Firestore model
      const txnRef = doc(collection(db, 'transactions'));
      await updateDoc(doc(db, 'users', userData.uid), {
        lastSeen: serverTimestamp()
      });

      const newTxnId = `DEP_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

      await addDoc(collection(db, 'transactions'), {
        id: newTxnId,
        userId: userData.uid,
        userName: userData.displayName,
        mobile: userData.mobile,
        type: "deposit",
        amount: parseFloat(depositAmount),
        utr: depositUtr,
        screenshot: depositScreenshot || "",
        status: "pending",
        timestamp: serverTimestamp()
      });

      // Notify the server-side Telegram alerting engine
      try {
        const token = localStorage.getItem('sr_token');
        await axios.post('/api/user/deposit/alert', {
          txnId: newTxnId,
          amount: parseFloat(depositAmount),
          utr: depositUtr
        }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch (alertErr: any) {
        console.error("Backend Telegram notification dispatcher failed:", alertErr);
      }

      setSuccess("Your Deposit Request has been registered! System verification is active.");
      setDepositAmount('');
      setDepositUtr('');
      setDepositScreenshot('');
      setActiveTab('home');
    } catch (err: any) {
      setError("Permissions error. Try logging out and logging in.");
    } finally {
      setProcessing(false);
    }
  };

  // --- Withdrawal Target QR Compression Engine ---
  const processWithdrawImageFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 450;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.6);
          setWithdrawalQrCode(compressed);
          setSuccess("Withdrawal receiving QR loaded & attached successfully!");
          setTimeout(() => setSuccess(null), 1500);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleWithdrawFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processWithdrawImageFile(file);
    }
  };

  const handleAdminQrFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 450;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > maxDim) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.6);
            setActiveQrCodeInput(compressed);
            setSuccess("Admin Custom Deposit QR loaded successfully!");
            setTimeout(() => setSuccess(null), 1500);
          }
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Outbound Payout / Withdrawal Disburse ---
  const handlePayout = async () => {
    if (!payoutAmount) {
      setError("Please specify the amount to withdraw");
      return;
    }
    
    let receiverVal = '';
    let attachedQr = '';
    
    if (withdrawalMethod === 'upi') {
      if (!withdrawalDetails) {
        setError("Please enter your receiving UPI Address match");
        return;
      }
      receiverVal = `UPI ID: ${withdrawalDetails}`;
    } else if (withdrawalMethod === 'number') {
      if (!withdrawalDetails) {
        setError("Please provide phone / bank account or details");
        return;
      }
      receiverVal = `Details: ${withdrawalDetails}`;
    } else if (withdrawalMethod === 'qr') {
      if (!withdrawalQrCode) {
        setError("Please upload your payment receiving custom QR code image");
        return;
      }
      receiverVal = "Scan Attached QR Code";
      attachedQr = withdrawalQrCode;
    }

    setProcessing(true);
    setError(null);
    try {
      const amtVal = parseFloat(payoutAmount);
      if (isNaN(amtVal) || amtVal <= 0) {
        throw new Error("Specify a valid withdrawal amount");
      }

      const newTxnId = `PAY_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      
      // Registers withdrawal request to firebase
      await addDoc(collection(db, 'transactions'), {
        id: newTxnId,
        userId: userData.uid,
        userName: userData.displayName,
        mobile: userData.mobile,
        type: "payout",
        amount: amtVal,
        receiver: receiverVal,
        screenshot: attachedQr || "", // Mapping receiving QR directly to screenshot so administrator scans or views it out-of-the-box!
        comment: payoutComment || `Withdrawal Mode: ${withdrawalMethod.toUpperCase()}`,
        status: "pending",
        timestamp: serverTimestamp()
      });

      setSuccess("Your withdrawal request has been submitted to administrator for check!");
      setPayoutNumber('');
      setPayoutAmount('');
      setPayoutComment('');
      setWithdrawalDetails('');
      setWithdrawalQrCode('');
      setActiveTab('home');

      // Send telegram alert
      try {
        await axios.post('/api/user/deposit/alert', {
          amount: payoutAmount,
          utr: `WITHDRAWAL_${withdrawalMethod.toUpperCase()}`,
          txnId: newTxnId
        }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('sr_token')}` }
        });
      } catch (err) {
        console.warn("Withdrawal alert fail", err);
      }
      
    } catch (err: any) {
      setError("Registration failed: " + err.message);
    } finally {
      setProcessing(false);
    }
  };

  // --- Bulk Batch Release ---
  const handleBulkPayout = async () => {
    if (!bulkData) return;
    setProcessing(true);
    setError(null);
    try {
      const rows = bulkData.split('\n').filter(r => r.includes(','));
      let count = 0;
      for (const row of rows) {
        const [num, amt] = row.split(',');
        if (num && amt) {
          await addDoc(collection(db, 'transactions'), {
            id: `PAY_${Math.random().toString(36).substring(2, 9).toUpperCase()}`,
            userId: userData.uid,
            userName: userData.displayName,
            mobile: userData.mobile,
            type: "payout",
            amount: parseFloat(amt),
            receiver: num.trim(),
            comment: "Bulk Batch Disbursal",
            status: "pending",
            timestamp: serverTimestamp()
          });
          count++;
        }
      }
      setSuccess(`Successfully queued ${count} disbursements into ledger.`);
      setBulkData('');
      setActiveTab('home');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setProcessing(false);
    }
  };

  // --- Secure Users Transfer ---
  const handleWalletTransfer = async () => {
    if (!transferMobile || !transferAmount || !transferMpin) {
      setError("Fill in all parameters for the wallet swap");
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/wallet/transfer', {
        receiverMobile: transferMobile,
        amount: transferAmount,
        pin: transferMpin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (res.data.status === 'success') {
        setSuccess(`Transfer successful! Sent ₹${transferAmount} to ${res.data.data.receiverName}.`);
        setTransferMobile('');
        setTransferAmount('');
        setTransferMpin('');
        setShowTransferModal(false);
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  // --- Gift Codes claiming & generating ---
  const handleClaimGiftCode = async () => {
    if (!giftCodeInput) return;
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/giftcode/claim', { code: giftCodeInput }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(`Voila! Claimed ₹${res.data.amount} successfully into your wallet!`);
        setGiftCodeInput('');
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateGiftCode = async () => {
    if (!createGiftAmount || !createGiftMpin) return;
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/giftcode/create', {
        amount: createGiftAmount,
        limit: createGiftLimit,
        expiryHours: createGiftHours,
        mpin: createGiftMpin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(`Gift Code successfully hosted: ${res.data.code}`);
        setCreateGiftAmount('');
        setCreateGiftMpin('');
        setShowCreateGiftModal(false);
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  // --- SR X Lifafa Claim and drop ---
  const handleClaimLifafa = async () => {
    if (!lifafaIdInput) return;
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/lifafa/claim', { id: lifafaIdInput.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(`Envelop Scratched! Claimed ₹${res.data.amount} successfully!`);
        setLifafaIdInput('');
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleCreateLifafa = async () => {
    if (!createLifafaAmount || !createLifafaMpin) return;
    setProcessing(true);
    setError(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/lifafa/create', {
        amount: createLifafaAmount,
        limit: createLifafaLimit,
        type: createLifafaType,
        channelLink: createLifafaChannel,
        mpin: createLifafaMpin
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(`SR X Lucky Lifafa is LIVE! Campaign ID: ${res.data.id}`);
        setCreateLifafaAmount('');
        setCreateLifafaMpin('');
        setShowCreateLifafaModal(false);
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  // --- Support Chat ---
  const handleSendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const body = chatInput;
    setChatInput('');
    try {
      const token = localStorage.getItem('sr_token');
      await axios.post('/api/chat/send', { message: body }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e: any) {
      console.error(e);
    }
  };

  // --- ADMIN DESK ACTIONS ---
  const handleAdminBalanceShift = async (targetUid: string, action: 'credit' | 'debit') => {
    const rawVal = action === 'credit' ? (adminBalanceInput[targetUid] || '') : (adminDebitInput[targetUid] || '');
    if (!rawVal) return;
    setProcessing(true);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/balance-adjust', {
        targetUid,
        amount: rawVal,
        action
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(res.data.message);
        setAdminBalanceInput(prev => ({ ...prev, [targetUid]: '' }));
        setAdminDebitInput(prev => ({ ...prev, [targetUid]: '' }));
      } else {
        throw new Error(res.data.message);
      }
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleAdminToggleFreeze = async (targetUid: string) => {
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/toggle-freeze', { targetUid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.message);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAdminToggleApi = async (targetUid: string) => {
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/toggle-api', { targetUid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.message);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAdminResetMpin = async (targetUid: string) => {
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/reset-mpin', { targetUid }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.message);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAdminToggleLock = async (targetUid: string, currentState: boolean) => {
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/unlock-lock', { targetUid, lockState: !currentState }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.message);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleAdminProcessPayout = async (txnId: string, action: 'approve' | 'reject') => {
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/admin/payout/action', { txnId, action }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSuccess(res.data.message);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleSaveTelegramId = async () => {
    if (!tempTelegramChatId) return;
    setProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      const token = localStorage.getItem('sr_token');
      const res = await axios.post('/api/user/save-telegram-id', { chatId: tempTelegramChatId }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.status === 'success') {
        setSuccess(`Congratulations! Connected successfully to Telegram Alerting Bot!`);
        const updatedUser = { ...userData, telegramChatId: tempTelegramChatId };
        setUserData(updatedUser);
        localStorage.setItem('sr_user_data', JSON.stringify(updatedUser));
        setShowTelegramModal(false);
      } else {
        setError(res.data.message || "Failed to link Telegram workspace.");
      }
    } catch (err: any) {
      setError(err.response?.data?.message || "Failed to sync connection.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSaveGatewayConfig = async () => {
    setProcessing(true);
    setError(null);
    setSuccess(null);
    try {
      await setDoc(doc(db, 'settings', 'global'), {
        upiId: activeUpiInput,
        telegramBotToken: activeBotTokenInput,
        telegramBotUsername: activeBotUsernameInput,
        qrCode: activeQrCodeInput
      }, { merge: true });
      setSuccess("Gateway Configuration successfully saved & updated globally in real-time! 🚀");
    } catch (err: any) {
      setError("Failed to save Gateway settings. Admin permissions required.");
    } finally {
      setProcessing(false);
    }
  };

  const handleSendAdminReply = async () => {
    if (!adminChatInput.trim() || !selectedChatUser) return;
    const body = adminChatInput;
    setAdminChatInput('');
    try {
      const token = localStorage.getItem('sr_token');
      await axios.post('/api/admin/chat/reply', {
        targetUid: selectedChatUser.uid,
        message: body
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (e: any) {
      console.error(e);
    }
  };

  // --- Copy Clipboard Helper ---
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess("Copied to clipboard!");
    setTimeout(() => setSuccess(null), 2000);
  };

  // Booting Loader
  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-yellow-500 font-extrabold tracking-widest text-xs uppercase animate-pulse">CONNECTING SR GATEWAY IN...</p>
        </div>
      </div>
    );
  }

  // FORCE MPIN SETUP VIEW
  if (user && forceMpinSetup) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6">
        <div className="max-w-md w-full space-y-8 bg-[#080808] border border-white/5 p-10 rounded-[3rem] text-center shadow-2xl">
          <div className="w-20 h-20 bg-yellow-500 rounded-[1.8rem] flex items-center justify-center mx-auto text-black">
            <ShieldCheck className="w-10 h-10" />
          </div>
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter uppercase">Initialize MPIN</h1>
            <p className="text-[10px] uppercase font-black tracking-widest text-slate-500 mt-2">SR Security Protocol mandated</p>
          </div>
          <div className="space-y-4">
            <input 
              type="password"
              maxLength={6}
              value={mpinInputVal}
              onChange={(e) => setMpinInputVal(e.target.value.replace(/\D/g, ''))}
              placeholder="Mpin Dalo"
              className="w-full bg-black text-center text-4xl font-mono tracking-[0.5em] border border-white/10 rounded-2xl py-6 font-black text-yellow-500 outline-none focus:border-yellow-500"
            />
            <button 
              onClick={handleSetupMpin}
              disabled={processing}
              className="w-full py-5 bg-yellow-500 text-black uppercase tracking-widest font-black text-xs rounded-2xl hover:bg-yellow-400 font-bold shadow-[0_0_15px_rgba(234,179,8,0.25)]"
            >
              Mpin Create Karo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // AUTH UI
  if (!user) {
    const isAdminScreen = isAdminPathActive;
    return (
      <div className="min-h-screen bg-[#030303] text-white flex flex-col items-center justify-center p-6 font-sans">
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-md w-full space-y-8">
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              <div className={cn("absolute inset-0 blur-2xl opacity-35 rounded-full animate-pulse", isAdminScreen ? "bg-purple-500 shadow-[0_0_35px_rgba(168,85,247,0.7)]" : "bg-yellow-500 shadow-[0_0_35px_rgba(234,179,8,0.7)]")} />
              <div className={cn("relative w-20 h-20 rounded-full flex items-center justify-center mx-auto shadow-2xl border-2 font-black italic text-2xl tracking-tighter text-black select-none", 
                isAdminScreen 
                  ? "bg-purple-500 border-purple-400 shadow-[0_0_20px_rgba(168,85,247,0.5)]" 
                  : "bg-gradient-to-tr from-yellow-600 to-yellow-400 border-yellow-300 shadow-[0_0_20px_rgba(234,179,8,0.5)]"
              )}>
                SR
              </div>
            </div>
            <h1 className="text-4xl font-extrabold italic tracking-tighter uppercase">SR <span className={isAdminScreen ? "text-purple-400" : "text-yellow-500"}>{isAdminScreen ? "ADMIN CONSOLE" : "GATEWAY IN"}</span></h1>
            <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.25em]">{isAdminScreen ? "SYSTEM OPERATIONS CONTROL" : "Automated Merchant Disbursements"}</p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4 pt-4">
            {authMode === 'register' && !isAdminScreen && (
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-widest text-slate-600 px-1">Full Merchant Name</label>
                <input 
                  type="text" 
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Operational Name"
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none focus:border-yellow-500 font-bold"
                />
              </div>
            )}
            <div className="space-y-1.5">
              <label className={cn("text-[9px] font-black uppercase tracking-widest px-1", isAdminScreen ? "text-purple-500/60" : "text-slate-600")}>Registered Mobile Number</label>
              <input 
                type="text" 
                value={mobileNumber}
                onChange={(e) => setMobileNumber(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Mobile Number Dalo"
                className={cn("w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none font-mono font-bold text-lg shadow-[0_0_15px_rgba(234,179,8,0.05)]", isAdminScreen ? "focus:border-purple-500 animate-pulse" : "focus:border-yellow-500")}
              />
            </div>
            <div className="space-y-1.5">
              <label className={cn("text-[9px] font-black uppercase tracking-widest px-1", isAdminScreen ? "text-purple-500/60" : "text-slate-600")}>Password</label>
              <input 
                type="password" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={authMode === 'login' ? "Password Dalo" : "New Password Create Karo"}
                className={cn("w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-6 outline-none font-bold", isAdminScreen ? "focus:border-purple-500" : "focus:border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.05)]")}
              />
            </div>
            <button 
              type="submit" 
              disabled={processing}
              className={cn(
                "w-full py-5 font-black uppercase tracking-widest rounded-2xl transition-all shadow-xl flex items-center justify-center gap-3 active:scale-95 text-xs font-bold border border-white/10",
                isAdminScreen 
                  ? "bg-purple-500 hover:bg-purple-400 text-black shadow-[0_0_20px_rgba(168,85,247,0.35)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] border-purple-400/30" 
                  : "bg-yellow-500 hover:bg-yellow-400 text-black shadow-[0_0_20px_rgba(234,179,8,0.35)] hover:shadow-[0_0_30px_rgba(234,179,8,0.6)] border-yellow-400/30"
              )}
            >
              {processing ? <Loader2 className="w-5 h-5 animate-spin" /> : (authMode === 'login' ? 'Login Now' : 'Register Now')}
            </button>
          </form>
 
          <div className="text-center space-y-4 pt-2">
            {!isAdminScreen && (
              <button 
                onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
                className="text-[10px] font-extrabold uppercase text-slate-400 hover:text-yellow-500 transition-colors bg-yellow-500/5 px-4 py-2 border border-yellow-500/10 rounded-xl hover:shadow-[0_0_15px_rgba(234,179,8,0.15)]"
              >
                {authMode === 'login' ? "Register Now" : "Login Now"}
              </button>
            )}
            <div className="pt-2">
              <button 
                onClick={() => setError(`Contact Support Team at ${SUPPORT_EMAIL} or @srsaportbot on Telegram for account password resets.`)}
                className="text-[9px] font-bold tracking-wider text-slate-600 hover:text-white"
              >
                Forgot Password?
              </button>
            </div>
          </div>
        </motion.div>

        {/* Floating Error Alert */}
        <AnimatePresence>
          {error && (
            <div className="fixed bottom-6 left-6 right-6 z-[120]">
              <motion.div initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="p-6 bg-red-600 rounded-2xl text-white font-bold flex items-center justify-between text-xs max-w-md mx-auto">
                <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</span>
                <button onClick={() => setError(null)} className="p-1 hover:bg-white/10 rounded"><X className="w-4 h-4" /></button>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans selection:bg-yellow-500/30">
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-lg mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div 
              onClick={() => setActiveTab('home')} 
              className={cn("w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-all shadow-[0_0_15px_rgba(234,179,8,0.45)] border-2 font-black italic text-sm text-black select-none",
                isAdminPathActive ? "from-purple-600 to-purple-400 border-purple-400 shadow-[0_0_15px_rgba(168,85,247,0.45)] bg-gradient-to-tr" : "from-yellow-600 to-yellow-400 border-yellow-400 bg-gradient-to-tr"
              )}
            >
              SR
            </div>
            <div>
              <h2 className="text-lg font-black italic tracking-tighter uppercase">
                {isAdminPathActive ? (
                  <>SR <span className="text-purple-400">ADMIN LIVE</span></>
                ) : (
                  <>SR <span className="text-yellow-500">GATEWAY</span></>
                )}
              </h2>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isAdminPathActive ? "bg-purple-500" : "bg-emerald-500")} />
                <span className={cn("text-[8px] font-black uppercase tracking-widest italic", isAdminPathActive ? "text-purple-400" : "text-emerald-500")}>
                  {isAdminPathActive ? "ADMINISTRATIVE CONSOLE" : `${userData?.displayName || 'Active Node'} • LIVE`}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
             {userData?.isAdmin && isAdminPathActive && (
               <button onClick={() => setActiveTab('admin')} className={cn(
                 "p-2.5 rounded-xl transition-all relative",
                 activeTab === 'admin' ? "text-yellow-500 bg-yellow-500/10" : "text-purple-400 hover:bg-white/5 animate-pulse"
               )}>
                  <Settings className="w-5 h-5" />
               </button>
             )}
             <button 
               onClick={() => setShowMenu(true)} 
               className="p-2.5 bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 rounded-xl hover:bg-yellow-500/20 hover:text-white transition-all duration-300 shadow-[0_0_15px_rgba(234,179,8,0.2)] active:scale-90"
             >
                <Menu className="w-5 h-5" />
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8 pb-32 space-y-8">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div key="home" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="space-y-8">
              {userData?.isLocked && (
                <div className="p-5 bg-red-950/40 border border-red-500/30 rounded-3xl flex items-center gap-4 text-red-400 text-xs font-black">
                  <BadgeAlert className="w-8 h-8 shrink-0 text-red-500" />
                  <div>
                    <p className="uppercase">Account Block State</p>
                    <p className="text-slate-400 text-[10px] font-medium leading-relaxed">Your wallet parameters are securely locked due to credentials mismatches. Contact operational help bot.</p>
                  </div>
                </div>
              )}

              {userData?.freezeStatus && (
                <div className="p-5 bg-amber-950/40 border border-amber-500/30 rounded-3xl flex items-center gap-4 text-amber-400 text-xs font-black">
                  <AlertTriangle className="w-8 h-8 shrink-0 text-amber-500 animate-bounce" />
                  <div>
                    <p className="uppercase">Wallet Hold Active</p>
                    <p className="text-slate-400 text-[10px] font-medium leading-relaxed">System administrator has placed high security holds on your withdrawals. Direct API payouts are frozen.</p>
                  </div>
                </div>
              )}

              <section className="relative group">
                <div className="absolute inset-0 bg-yellow-500 blur-3xl opacity-5" />
                <div className="relative bg-gradient-to-br from-white/10 to-transparent border border-white/10 rounded-[2.5rem] p-8 space-y-6 overflow-hidden backdrop-blur-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500 mb-1.5 italic">Capital Ledger Balance</p>
                      <h1 className="text-5xl font-black italic tracking-tighter text-white">
                        ₹{(userData?.balance || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </h1>
                    </div>
                    <div className="w-12 h-12 bg-yellow-500/10 rounded-2xl flex items-center justify-center border border-yellow-500/20">
                      <Zap className="w-6 h-6 text-yellow-500" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3.5">
                    <button 
                      onClick={() => setActiveTab('deposit')} 
                      className="py-4.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black uppercase text-[10px] tracking-[0.2em] rounded-xl active:scale-95 transition-all shadow-[0_0_20px_rgba(234,179,8,0.35)] hover:shadow-[0_0_30px_rgba(234,179,8,0.6)] font-bold border border-yellow-300/30"
                    >
                      DEPOSIT
                    </button>
                    <button 
                      onClick={() => setActiveTab('payout')} 
                      className="py-4.5 bg-white/5 border border-white/10 text-white font-black uppercase text-[10px] tracking-[0.2em] rounded-xl active:scale-95 transition-all hover:shadow-[0_0_15px_rgba(255,255,255,0.05)] font-bold"
                    >
                      WITHDRAWAL
                    </button>
                  </div>
                </div>
              </section>

              {/* OPERATIONAL MICRO TOOLS PANEL */}
              <section className="grid grid-cols-2 gap-4">
                <button onClick={() => setShowTransferModal(true)} className="p-6 bg-gradient-to-b from-white/5 to-transparent border border-white/5 rounded-[2rem] flex flex-col items-center text-center gap-3 hover:bg-white/10 transition-all group shadow-[0_0_15px_rgba(16,185,129,0.05)] hover:border-emerald-500/20">
                  <div className="p-4 rounded-xl bg-emerald-500/5 text-emerald-500 group-hover:scale-110 transition-transform"><Send className="w-5 h-5" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">User to User</span>
                  <span className="text-[8px] text-slate-500 uppercase font-black">User-To-User instant transfer</span>
                </button>
                <button onClick={() => setShowCreateGiftModal(true)} className="p-6 bg-gradient-to-b from-white/5 to-transparent border border-white/5 rounded-[2rem] flex flex-col items-center text-center gap-3 hover:bg-white/10 transition-all group shadow-[0_0_15px_rgba(234,179,8,0.05)] hover:border-yellow-500/20">
                  <div className="p-4 rounded-xl bg-yellow-500/5 text-yellow-500 group-hover:scale-110 transition-transform"><Gift className="w-5 h-5" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">Gift Code Create</span>
                  <span className="text-[8px] text-slate-500 uppercase font-black">Issue & redeem promo balance</span>
                </button>
              </section>

              {/* SR X LIFAFA SYSTEMS SCREEN CARD */}
              <section className="p-8 bg-gradient-to-r from-red-950/20 to-transparent border border-red-500/10 rounded-[2.5rem] space-y-4 shadow-[0_0_20px_rgba(239,68,68,0.05)]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.1)]"><Sparkles className="w-6 h-6" /></div>
                  <div>
                    <h3 className="text-md font-black italic uppercase text-red-400">SR X Lucky Lifafa</h3>
                    <p className="text-[8px] text-slate-500 font-bold uppercase tracking-widest">Envelop Scratch Promotions</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={lifafaIdInput}
                    onChange={(e) => setLifafaIdInput(e.target.value)}
                    placeholder="Enter Lifafa ID (e.g. LFA-XXX)"
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 text-xs font-mono outline-none focus:border-red-500"
                  />
                  <button onClick={handleClaimLifafa} className="px-6 py-3.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    Claim
                  </button>
                </div>
                <div className="text-center">
                  <button onClick={() => setShowCreateLifafaModal(true)} className="text-[9px] font-bold text-red-400 hover:brightness-125 uppercase tracking-wider">
                    + Lifafa Create
                  </button>
                </div>
              </section>

              {/* GIFT CARD CLAIM CARD */}
              <section className="p-8 bg-gradient-to-r from-teal-950/20 to-transparent border border-teal-500/10 rounded-[2.5rem] space-y-4 shadow-[0_0_20px_rgba(20,184,166,0.05)]">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.1)]"><Gift className="w-5 h-5" /></div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-teal-400 tracking-wider">Redeem Gift Card Code</h4>
                    <p className="text-[8px] text-slate-500 font-bold">Instantly converts to operating balance</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={giftCodeInput}
                    onChange={(e) => setGiftCodeInput(e.target.value)}
                    placeholder="SR-XXXX-XXXX"
                    className="flex-1 bg-black/40 border border-white/5 rounded-xl px-4 text-xs font-mono outline-none focus:border-teal-500"
                  />
                  <button onClick={handleClaimGiftCode} className="px-5 py-3 text-[10px] font-extrabold uppercase bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.3)]">
                    Claim
                  </button>
                </div>
              </section>

              {/* --- HOSTED CODE CAMPAIGNS TRACKER --- */}
              <section className="p-8 bg-gradient-to-b from-purple-950/20 to-transparent border border-purple-500/10 rounded-[2.5rem] space-y-6 shadow-[0_0_20px_rgba(168,85,247,0.05)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.1)]"><Sparkles className="w-5 h-5 animate-pulse" /></div>
                    <div>
                      <h4 className="text-sm font-black uppercase text-purple-400 tracking-wider">Campaign Tracking Hub</h4>
                      <p className="text-[8px] text-slate-500 font-bold uppercase pb-0.5">Your Active Gift Codes & Lucky Lifafas</p>
                    </div>
                  </div>
                  <button onClick={fetchUserCreatedCodes} className="p-2 bg-white/5 hover:bg-white/10 text-slate-400 rounded-lg text-xs"><RefreshCcw className={cn("w-3.5 h-3.5", processing ? "animate-spin" : "")} /></button>
                </div>

                <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                  {userCreatedCodes && userCreatedCodes.length > 0 ? (
                    userCreatedCodes.map((item: any) => {
                      const isGift = item.type === 'gift';
                      const isCampaignActive = item.active !== false; 
                      const claimLimit = item.limit || 1;
                      const claimsCount = item.claimers ? item.claimers.length : 0;
                      return (
                        <div key={item.id} className="p-4 bg-black/45 border border-white/5 rounded-2xl flex items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className={cn(
                                "text-[7px] font-black uppercase px-2 py-0.5 rounded",
                                isGift ? "bg-teal-500/10 text-teal-400 border border-teal-500/20" : "bg-red-500/10 text-red-400 border border-red-500/20"
                              )}>
                                {isGift ? "Gift Card" : "Lucky Lifafa"}
                              </span>
                              <span className="font-mono text-[10px] font-black text-rose-300 select-all tracking-wider">{item.id}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-[9px] text-slate-400 font-bold">
                                Value: <span className="text-white font-extrabold">₹{item.amount}</span>
                              </p>
                              <p className="text-[9px] text-slate-500 font-bold">•</p>
                              <p className="text-[9px] text-slate-400 font-bold">
                                Claims: <span className="text-white font-extrabold">{claimsCount} / {claimLimit}</span>
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "text-[8px] font-black uppercase tracking-widest",
                              isCampaignActive ? "text-emerald-500" : "text-slate-600"
                            )}>
                              {isCampaignActive ? "ONLINE" : "OFFLINE"}
                            </span>
                            <button
                              onClick={() => handleToggleCode(item.id, item.type)}
                              disabled={processing}
                              className={cn(
                                "px-3.5 py-2 text-[8px] font-black uppercase tracking-wider rounded-lg transition-all active:scale-95 disabled:opacity-50",
                                isCampaignActive
                                  ? "bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20"
                                  : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/20"
                              )}
                            >
                              {isCampaignActive ? "OFF" : "ON"}
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="py-6 text-center text-slate-600 text-[10px] uppercase font-bold italic border border-dashed border-white/5 bg-black/10 rounded-2xl">
                      No matching hosted promotion codes found currently.
                    </div>
                  )}
                </div>
              </section>

              {/* CORE METRIC SHUNTS */}
              <section className="grid grid-cols-2 gap-4">
                <button onClick={() => setActiveTab('bulk')} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex flex-col items-center gap-3 hover:bg-white/10 transition-all group hover:border-yellow-500/20 shadow-[0_0_12px_rgba(255,255,255,0.02)]">
                  <div className="p-4 rounded-xl bg-yellow-500/5 text-yellow-500 group-hover:scale-110 transition-transform"><Zap className="w-5 h-5" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">Bulk Pay</span>
                </button>
                <button onClick={() => setActiveTab('api')} className="p-6 bg-white/5 border border-white/5 rounded-3xl flex flex-col items-center gap-3 hover:bg-white/10 transition-all group hover:border-blue-500/20 shadow-[0_0_12px_rgba(255,255,255,0.02)]">
                  <div className="p-4 rounded-xl bg-blue-500/5 text-blue-500 group-hover:scale-110 transition-transform"><KeyIcon className="w-5 h-5" /></div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] italic">API Key Setting</span>
                </button>
              </section>

              {/* CUSTOM LIVE SUPPORT MESSAGE CONTEXT */}
              <section className="p-6 bg-blue-950/20 border border-blue-500/10 rounded-[2.5rem] space-y-4 shadow-[0_0_15px_rgba(59,130,246,0.05)]">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-5 h-5 text-blue-400" />
                    <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Live Chat Support</span>
                  </div>
                  <span className="text-[8px] bg-blue-500/10 text-blue-400 px-2 py-1 rounded font-bold uppercase">Online Help desk</span>
                </div>
                <div className="h-44 bg-black/40 border border-white/5 rounded-2xl p-4 overflow-y-auto space-y-3 font-sans text-xs">
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("max-w-[85%] p-3 rounded-xl", msg.sender === 'admin' ? "bg-blue-600 text-white mr-auto" : "bg-white/5 text-white ml-auto border border-white/5")}>
                      <p className="leading-relaxed font-bold">{msg.message}</p>
                      <span className="text-[7px] text-white/50 block text-right mt-1 font-mono">{formatTimestamp(msg.timestamp) || "Recent"}</span>
                    </div>
                  ))}
                  {chatMessages.length === 0 && (
                    <p className="text-center text-slate-600 text-[10px] uppercase font-bold py-10 italic">No messages yet. Ask about API integration, deposits, or mpin reset!</p>
                  )}
                  <div ref={chatBottomRef} />
                </div>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChatMessage()}
                    placeholder="Type message to support @srsaportbot..."
                    className="flex-1 bg-black border border-white/10 rounded-xl px-4 text-xs font-bold outline-none focus:border-blue-500"
                  />
                  <button onClick={handleSendChatMessage} className="p-3 bg-blue-600 text-white rounded-xl active:scale-95 transition-transform"><SendHorizonal className="w-4 h-4" /></button>
                </div>
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between px-3">
                  <h3 className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Live Transactions</h3>
                  <button onClick={() => setActiveTab('history')} className="text-[9px] font-black uppercase text-yellow-500 hover:brightness-125 underline decoration-2 underline-offset-4">GRAND LEDGER</button>
                </div>
                <div className="space-y-3 px-1">
                  {transactions.slice(0, 5).map((txn) => {
                    const cat = getTransactionCategory(txn.type);
                    return (
                      <div key={txn.id} className="p-5 bg-white/5 border border-white/5 rounded-2xl flex items-center justify-between hover:bg-white/10 hover:border-white/10 transition-colors text-xs font-bold">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                            cat.colorClass
                          )}>
                            {cat.isCredit ? <Plus className="w-4 h-4" /> : <Minus className="w-4 h-4" />}
                          </div>
                          <div>
                            <p className="uppercase tracking-widest text-[9px] text-white leading-tight">{cat.label}</p>
                            <p className="text-[7px] text-slate-500 uppercase font-black mt-0.5">{txn.status} • {formatDateOnly(txn.timestamp)}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-sm font-black italic", cat.textColor)}>
                            {cat.isCredit ? '+' : '-'}₹{(txn.amount || 0).toFixed(2)}
                          </span>
                          <span className="block text-[7px] text-slate-600 uppercase font-mono mt-0.5">REF_{txn.id.slice(0,6)}</span>
                        </div>
                      </div>
                    );
                  })}
                  {transactions.length === 0 && (
                    <div className="py-20 text-center border border-dashed border-white/5 rounded-[2rem] opacity-20">
                      <History className="w-10 h-10 mx-auto mb-3" />
                      <p className="text-[9px] font-black uppercase tracking-widest">No Activity Yet</p>
                    </div>
                  )}
                </div>
              </section>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8 animate-fade-in">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">My Account</h2>
               </div>

               <div className="p-10 bg-white/5 border border-white/10 rounded-[3rem] flex flex-col items-center text-center space-y-6">
                 <div className="relative">
                    <div className="absolute inset-0 bg-yellow-500 blur-2xl opacity-20 animate-pulse" />
                    <div className="relative w-24 h-24 bg-yellow-500 rounded-[2rem] flex items-center justify-center text-black font-black text-4xl italic shadow-2xl">
                      {userData?.displayName?.charAt(0) || 'S'}
                    </div>
                 </div>
                 <div>
                   <h3 className="text-2xl font-black italic tracking-tight">{userData?.displayName || 'Merchant Partner'}</h3>
                   <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500 mt-1.5">{userData?.mobile || 'MOBILE UNLINKED'}</p>
                 </div>
                 <div className="flex gap-3 w-full pt-6 text-2xs font-extrabold uppercase">
                    <div className="flex-1 p-4 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                       <p className="text-[8px] text-slate-600 mb-1">Status Protocol</p>
                       <p className="text-[10px] text-emerald-400 font-mono font-bold tracking-widest italic">SR_VERIFIED</p>
                    </div>
                    <div className="flex-1 p-4 bg-black/40 rounded-2xl border border-white/5 backdrop-blur-sm">
                       <p className="text-[8px] text-slate-600 mb-1">Disbursement Tier</p>
                       <p className="text-[10px] text-yellow-500 font-mono font-bold tracking-widest italic">{userData?.isVip ? 'VIP_LEVEL' : 'STANDARD'}</p>
                    </div>
                 </div>
               </div>

               <div className="space-y-4 px-1">
                 <button onClick={() => setActiveTab('settings')} className="w-full p-6 bg-white/5 border border-white/5 rounded-[2rem] flex items-center justify-between group hover:bg-white/10 transition-all font-bold">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-yellow-500/10 rounded-xl text-yellow-500"><ShieldCheck className="w-5 h-5" /></div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] italic text-xs">Security Passkey Lock</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:translate-x-1 transition-transform" />
                 </button>
                 <button onClick={() => setActiveTab('history')} className="w-full p-6 bg-white/5 border border-white/5 rounded-[2rem] flex items-center justify-between group hover:bg-white/10 transition-all font-bold">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-blue-500/10 rounded-xl text-blue-500"><History className="w-5 h-5" /></div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] italic text-xs">Full Ledger Logs</span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-600 group-hover:translate-x-1 transition-transform" />
                 </button>
                 <button onClick={handleLogOut} className="w-full p-6 border border-red-500/20 bg-red-500/5 rounded-[2.2rem] flex items-center justify-between group hover:bg-red-500/10 transition-all font-bold">
                    <div className="flex items-center gap-4 text-red-500">
                      <div className="p-3 bg-red-500/10 rounded-xl"><LogOut className="w-5 h-5" /></div>
                      <span className="text-[10px] font-black uppercase tracking-[0.2em] italic text-xs">Kill Host Session</span>
                    </div>
                 </button>
               </div>
            </motion.div>
          )}

          {activeTab === 'history' && (
             <motion.div key="history" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-8">
                <div className="flex items-center gap-4">
                  <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                  <h2 className="text-3xl font-black italic uppercase tracking-tighter">Grand Ledger</h2>
                </div>
                <div className="space-y-4 px-1">
                  {transactions.map((txn) => {
                    const cat = getTransactionCategory(txn.type);
                    return (
                      <div key={txn.id} className="p-6 bg-white/5 border border-white/5 rounded-[2.2rem] flex items-center justify-between font-bold text-xs">
                        <div className="flex items-center gap-4">
                           <div className={cn(
                             "w-12 h-12 rounded-2xl flex items-center justify-center",
                             cat.colorClass
                           )}>
                             {cat.isCredit ? <Plus className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
                           </div>
                           <div className="space-y-1">
                             <p className="text-[10px] font-black uppercase tracking-[0.2em] leading-tight text-white">{cat.label}</p>
                             <p className="text-[8px] text-slate-500 uppercase font-black">
                               {txn.status} • {formatTimestamp(txn.timestamp)}
                             </p>
                             {txn.utr && <p className="text-[8px] text-emerald-500 font-mono tracking-tighter mt-1">UTR: {txn.utr}</p>}
                             {txn.receiver && <p className="text-[8px] text-blue-400 font-mono mt-1">To: {txn.receiver}</p>}
                           </div>
                        </div>
                        <div className="text-right">
                          <span className={cn("text-base font-black italic", cat.textColor)}>
                            {cat.isCredit ? '+' : '-'}₹{(txn.amount || 0).toFixed(2)}
                          </span>
                          <div className="flex items-center gap-1 justify-end mt-1.5">
                            <Check className="w-2.5 h-2.5 text-emerald-500" />
                            <span className="text-[8px] font-black uppercase text-slate-600 tracking-tighter">REF_{txn.id.slice(0, 6)}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {transactions.length === 0 && (
                    <div className="py-24 text-center opacity-20">
                      <History className="w-14 h-14 mx-auto mb-5" />
                      <p className="text-[10px] font-black uppercase tracking-[0.4em]">Empty Ledger</p>
                    </div>
                  )}
                </div>
             </motion.div>
          )}

          {activeTab === 'deposit' && (
            <motion.div key="deposit" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">Deposit Funds</h2>
               </div>
               
               <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-[2.5rem] space-y-8 shadow-[0_0_20px_rgba(16,185,129,0.05)]">
                 <div className="flex flex-col items-center gap-6">
                   <div className="relative group cursor-pointer" onClick={downloadQRCode} title="Click to Download QR Code">
                      <div className="absolute inset-0 bg-emerald-500 blur-3xl opacity-10 group-hover:opacity-20 transition-opacity" />
                      <div className="relative p-5 bg-white rounded-[2rem] shadow-2xl transition-transform group-hover:scale-[1.02]">
                        {gatewayConfig.qrCode ? (
                          <img src={gatewayConfig.qrCode} alt="Merchant QR Code" className="w-[180px] h-[180px] object-contain rounded-xl text-black font-bold text-center flex items-center justify-center text-xs" />
                        ) : (
                          <QRCodeSVG id="deposit-qr-svg" value={`upi://pay?pa=${gatewayConfig.upiId}&pn=SR+GATEWAY+IN`} size={180} />
                        )}
                      </div>
                      <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-black hover:bg-slate-900 border border-emerald-500/30 text-emerald-400 font-extrabold uppercase text-[7px] tracking-widest rounded-lg transition-all animate-pulse whitespace-nowrap shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                        🖱️ Click QR to Download
                      </span>
                   </div>
                   <div className="text-center space-y-2.5 pt-4">
                     <p className="text-[10px] font-black uppercase tracking-[0.4em] text-emerald-500 italic">Operating UPI Hub Address</p>
                     <p className="text-2xl font-black italic tracking-tight text-white">{gatewayConfig.upiId}</p>
                     <div className="flex gap-2 justify-center">
                       <button onClick={() => copyToClipboard(gatewayConfig.upiId)} className="px-6 py-2.5 text-[9px] font-black bg-white/10 hover:bg-white/20 text-white rounded-full transition-all border border-white/5 font-mono">COPY UPI ID</button>
                       <button onClick={downloadQRCode} className="px-6 py-2.5 text-[9px] font-black bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 rounded-full transition-all border border-emerald-500/20 font-mono shadow-[0_0_12px_rgba(16,185,129,0.1)]">DOWNLOAD QR</button>
                     </div>
                   </div>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-1 px-1">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Deposit Amount (INR)</label>
                       <input 
                         type="number" 
                         value={depositAmount}
                         onChange={(e) => setDepositAmount(e.target.value)}
                         placeholder="0.00"
                         className="w-full bg-black border border-white/10 rounded-2xl py-4.5 px-6 font-black italic text-2xl outline-none focus:border-emerald-500 transition-all text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.05)]"
                       />
                    </div>
                    <div className="space-y-1 px-1">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">UPI Reference UTR (12 Digits)</label>
                       <input 
                         type="text" 
                         value={depositUtr}
                         onChange={(e) => setDepositUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
                         placeholder="12-Digit Reference number"
                         className="w-full bg-black border border-white/10 rounded-2xl py-4.5 px-6 font-bold tracking-widest text-lg outline-none focus:border-emerald-500 font-mono text-center text-white placeholder:text-slate-800"
                       />
                    </div>
                    
                    <div className="space-y-2 px-1">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Upload Payment Screenshot</label>
                       <div className="relative border-2 border-dashed border-white/10 hover:border-emerald-500/50 rounded-2xl p-6 transition-all bg-black/40 text-center cursor-pointer group shadow-inner">
                         <input 
                           type="file" 
                           accept="image/*" 
                           onChange={handleFileChange} 
                           className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                         />
                         {depositScreenshot ? (
                           <div className="space-y-2">
                             <img 
                               src={depositScreenshot} 
                               alt="Receipt thumbnail" 
                               className="mx-auto h-24 object-cover rounded-lg border border-white/20 shadow-md" 
                             />
                             <p className="text-[9px] text-emerald-400 font-bold uppercase w-full">Screenshot Attached (Click to replace)</p>
                           </div>
                         ) : (
                           <div className="space-y-2">
                             <Upload className="w-8 h-8 text-slate-500 mx-auto group-hover:text-emerald-400 transition-colors" />
                             <p className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wider">Drag & drop or Click to Upload screenshot</p>
                             <p className="text-[8px] text-slate-600 uppercase">JPEG or PNG format (max 5MB)</p>
                           </div>
                         )}
                       </div>
                    </div>

                    <button 
                      onClick={handleDeposit}
                      disabled={processing || !depositAmount || !depositUtr}
                      className="w-full py-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-black font-black uppercase tracking-widest rounded-2xl shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.55)] active:scale-95 disabled:opacity-50 transition-all font-bold text-xs border border-emerald-400/30"
                    >
                      {processing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Deposit Request'}
                    </button>
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'payout' && (
            <motion.div key="payout" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter text-yellow-500">Secure Withdrawal</h2>
               </div>

               <div className="bg-yellow-500/5 border border-yellow-500/20 p-8 rounded-[2.5rem] space-y-6">
                 {/* 1. SELECT AMOUNT PRESETS */}
                 <div className="space-y-2">
                   <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Select Amount (INR)</label>
                   <div className="grid grid-cols-3 gap-2">
                     {["100", "500", "1000", "2000", "5000", "10000"].map((preset) => (
                       <button
                         key={preset}
                         type="button"
                         onClick={() => setPayoutAmount(preset)}
                         className={cn(
                           "py-3 rounded-xl font-bold text-xs uppercase transition-all tracking-wider border",
                           payoutAmount === preset 
                             ? "bg-yellow-500 text-black border-yellow-500 font-black scale-[1.02] shadow-[0_0_15px_rgba(234,179,8,0.2)]" 
                             : "bg-black/45 hover:bg-white/5 border-white/10 text-slate-400"
                         )}
                       >
                         ₹{preset}
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Custom Amount Entry */}
                 <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Or Enter Exact Amount</label>
                    <input 
                      type="number" 
                      value={payoutAmount}
                      onChange={(e) => setPayoutAmount(e.target.value)}
                      placeholder="Enter other custom value"
                      className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-black italic text-xl outline-none focus:border-yellow-500 text-yellow-500"
                    />
                 </div>

                 {/* 2. CHOOSE PAYMENT CHANNEL */}
                 <div className="space-y-2 pt-2">
                   <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Choose Payment Destination Mode</label>
                   <div className="grid grid-cols-3 gap-2">
                     {(['upi', 'qr', 'number'] as const).map((method) => {
                       let label = "UPI ID";
                       if (method === 'qr') label = "QR Code";
                       if (method === 'number') label = "Bank Details";
                       return (
                         <button
                           key={method}
                           type="button"
                           onClick={() => {
                             setWithdrawalMethod(method);
                             setWithdrawalDetails('');
                           }}
                           className={cn(
                             "py-3.5 rounded-xl font-black text-[9px] uppercase tracking-wider transition-all border",
                             withdrawalMethod === method
                               ? "bg-white text-black border-white shadow-2xl"
                               : "bg-black/45 hover:bg-white/5 border-white/10 text-slate-400"
                           )}
                         >
                           {label}
                         </button>
                       );
                     })}
                   </div>
                 </div>

                 {/* 3. CONDITIONAL METHOD INPUTS */}
                 <div className="space-y-4 pt-1">
                   {withdrawalMethod === 'upi' && (
                     <div className="space-y-1">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Your Receiving UPI Address</label>
                       <input 
                         type="text"
                         value={withdrawalDetails}
                         onChange={(e) => setWithdrawalDetails(e.target.value)}
                         placeholder="e.g. yourname@ybl, mobile@paytm"
                         className="w-full bg-black border border-white/10 rounded-2xl py-4.5 px-6 font-bold text-sm outline-none focus:border-yellow-500 text-white"
                       />
                     </div>
                   )}

                   {withdrawalMethod === 'number' && (
                     <div className="space-y-1">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Your Mobile Number or Bank details</label>
                       <textarea 
                         value={withdrawalDetails}
                         onChange={(e) => setWithdrawalDetails(e.target.value)}
                         placeholder="Specify receiving Mobile number, or Bank Account No, Bank Name, and IFSC details"
                         rows={2}
                         className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 font-bold text-xs outline-none focus:border-yellow-500 text-white"
                       />
                     </div>
                   )}

                   {withdrawalMethod === 'qr' && (
                     <div className="space-y-3">
                       <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Upload Payout Receiving QR Code</label>
                       <div className="border border-dashed border-white/10 p-6 rounded-2xl bg-black/40 flex flex-col items-center justify-center text-center space-y-4">
                         {withdrawalQrCode ? (
                           <div className="relative">
                             <img src={withdrawalQrCode} alt="payout qr" className="w-28 h-28 object-contain rounded-xl border border-white/20 shadow-2xl" />
                             <button
                               type="button"
                               onClick={() => setWithdrawalQrCode('')}
                               className="absolute -top-1.5 -right-1.5 bg-red-600 rounded-full p-1 text-white hover:bg-red-500"
                             >
                               <X className="w-3" />
                             </button>
                           </div>
                         ) : (
                           <>
                             <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center text-slate-400"><Upload className="w-5 h-5 animate-pulse" /></div>
                             <div className="space-y-1">
                               <p className="text-[10px] font-extrabold uppercase text-white tracking-widest">Select Target QR File</p>
                               <p className="text-[8px] text-slate-500 font-bold">Image size is compressed automatically</p>
                             </div>
                           </>
                         )}
                         <input 
                           type="file" 
                           accept="image/*"
                           onChange={handleWithdrawFileChange}
                           className="text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:bg-yellow-500 file:text-black hover:file:bg-yellow-400 cursor-pointer"
                         />
                       </div>
                     </div>
                   )}

                   {/* Commment row / Payout Comment */}
                   <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Withdrawal Remark (Optional)</label>
                      <input 
                        type="text" 
                        value={payoutComment}
                        onChange={(e) => setPayoutComment(e.target.value)}
                        placeholder="e.g. self, emergency load"
                        className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-xs font-bold outline-none focus:border-yellow-500 text-white"
                      />
                   </div>

                   <button 
                     onClick={() => triggerActionWithPin(handlePayout)}
                     disabled={!payoutAmount || processing}
                     className="w-full py-5 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 disabled:opacity-50 transition-all text-xs"
                   >
                     {processing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Submit Withdrawal Request'}
                   </button>
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'bulk' && (
            <motion.div key="bulk" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">Bulk Engine</h2>
               </div>
               
               <div className="bg-blue-500/5 border border-blue-500/20 p-8 rounded-[2.5rem] space-y-6">
                 <div className="space-y-4 px-1">
                    <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic px-1">Batch payloads (mobile,amount per line)</label>
                    <textarea 
                      value={bulkData}
                      onChange={(e) => setBulkData(e.target.value)}
                      placeholder="9876543210,150.00&#10;9988776655,500.00"
                      className="w-full h-48 bg-black border border-white/10 rounded-2xl py-6 px-6 font-mono text-xs outline-none focus:border-blue-500 transition-all resize-none text-white placeholder:text-slate-800"
                    />
                    <button 
                      onClick={() => triggerActionWithPin(handleBulkPayout)}
                      disabled={!bulkData || processing}
                      className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-2xl active:scale-95 transition-all text-xs"
                    >
                      Trigger Automated Batch
                    </button>
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'api' && (
            <motion.div key="api" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="space-y-8">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('home')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">API Key Setting</h2>
               </div>

               <div className="space-y-8 animate-fade-in font-bold text-xs">
                 <div className="p-8 bg-blue-500/5 border border-blue-500/20 rounded-[2.5rem] space-y-4 backdrop-blur-sm shadow-[0_0_20px_rgba(59,130,246,0.1)]">
                   <div className="flex items-center justify-between">
                     <p className="text-[9px] font-black uppercase text-blue-500 tracking-widest italic">Secret Wallet API Key</p>
                   </div>
                   <div className="flex items-center gap-4 bg-black p-5 rounded-xl border border-white/10 shadow-inner">
                     <code className="flex-1 text-xs font-black italic text-white font-mono break-all pb-1 tracking-tighter">
                        {userData?.apiKey || 'Configuring Node Key...'}
                     </code>
                     <button 
                        onClick={() => copyToClipboard(userData?.apiKey || '')} 
                        disabled={!userData?.apiKey}
                        className="p-3.5 bg-blue-500/10 hover:bg-blue-500/20 rounded-xl text-blue-400 disabled:opacity-30 transition-all shrink-0 shadow-[0_0_12px_rgba(59,130,246,0.2)]"
                      >
                        <Copy className="w-4 h-4" />
                     </button>
                   </div>
                   <p className="text-[8px] text-slate-700 uppercase italic text-center tracking-widest leading-loose">
                     * This key facilitates automated payouts linked directly to your wallet account. Safeguard.
                   </p>
                 </div>

                 <div className="space-y-3 px-1">
                   <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest px-2 italic">Automated REST Payout Endpoint (POST/GET)</h4>
                 </div>

                  <div className="space-y-3 px-1">
                   <div className="bg-[#030303] border border-white/5 p-6 rounded-2xl overflow-x-auto text-[10px] text-blue-400 font-mono select-all">
                      {userData?.apiKey 
                        ? `${window.location.origin}/api/pay?key=${userData.apiKey}&number={mobile}&amount={rupees}`
                        : `${window.location.origin}/api/pay?key=YOUR_API_TOKEN&number={mobile}&amount={amount}`}
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4 px-1">
                     <div className="p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-blue-500/20 transition-colors cursor-pointer group">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-2 group-hover:text-blue-400 transition-colors">Balance Check</p>
                        <code className="text-[8px] text-slate-600 break-all leading-normal font-mono">/payment/balance?key={userData?.apiKey ? userData.apiKey.slice(0, 5) : 'XXXXX'}...</code>
                     </div>
                     <div className="p-6 bg-white/5 border border-white/5 rounded-2xl hover:bg-white/10 hover:border-blue-500/20 transition-colors cursor-pointer group">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-2 group-hover:text-blue-400 transition-colors">Endpoint Audit</p>
                        <code className="text-[8px] text-slate-600 break-all leading-normal font-mono">/payment/verify?key={userData?.apiKey ? userData.apiKey.slice(0, 5) : 'XXXXX'}...</code>
                     </div>
                 </div>

                 {/* DETAILED CYBER DEVELOPER SYSTEM MANUAL */}
                 <div className="p-8 bg-gradient-to-b from-white/5 to-transparent border border-white/5 rounded-[2.5rem] space-y-6">
                   <h3 className="text-sm font-black uppercase italic tracking-wider text-slate-300 pb-3 border-b border-white/5">SR Real-Time Dev Integration Manual</h3>
                   
                   <div className="space-y-4">
                     <div>
                       <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider mb-1">1. Custom Webhook Sync Options</p>
                       <p className="text-[9px] text-slate-400 leading-relaxed font-normal">Our multi-payout node fires a real-time web-hook notification immediately on payment settlement. Expected callback timeout: 5000ms. In case of webhook delivery failures, the gateway retries up to 3 times sequentially.</p>
                     </div>

                     <div>
                       <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider mb-1">2. Core Validation Rules & Bypass Code</p>
                       <p className="text-[9px] text-slate-400 leading-relaxed font-normal">To bypass manual security validation delays, transactions must submit with authentic 10-digit Indian recipient numbers. Transactions without matching destination partner profiles are rejected with structural err codes to prevent fluid loss.</p>
                     </div>

                     <div>
                       <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider mb-1">3. Security Keys & Custom Headers</p>
                       <p className="text-[9px] text-slate-400 leading-relaxed font-normal font-mono bg-black/60 p-3 rounded-lg border border-white/5">Header Format:<br/>Authorization: Bearer YOUR_API_TOKEN<br/>X-SR-Signature: hash_hmac_sha256(payload, secret)</p>
                     </div>

                     <div>
                       <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider mb-1">4. Telegram Bot Callback Configuration</p>
                       <p className="text-[9px] text-slate-400 leading-relaxed font-normal">Send `/setwebhook` with your server callback endpoint to map transactions to Telegram. On triggers, our engine dispatches an automated pure, parsed JSON package directly to the configured Chat Handler.</p>
                     </div>

                     <div>
                       <p className="text-[9px] font-black uppercase text-blue-400 tracking-wider mb-1">5. Expected JSON Payload Output</p>
                       <pre className="text-[8.5px] text-emerald-400 font-mono bg-black/80 p-4 rounded-xl border border-white/10 leading-normal select-all overflow-x-auto whitespace-pre">
{`{
  "status": "success",
  "transaction_id": "TXN_77498217349",
  "amount_debited": 250.00,
  "recipient": "9876543210",
  "gateway": "SR_DISPATCH_NODE",
  "timestamp": "2026-05-22T17:34:00Z"
}`}
                       </pre>
                     </div>
                   </div>
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-8">
               <div className="flex items-center gap-4">
                 <button onClick={() => setActiveTab('profile')} className="p-2.5 hover:bg-white/5 rounded-xl text-slate-500"><ChevronRight className="w-6 h-6 rotate-180" /></button>
                 <h2 className="text-3xl font-black italic uppercase tracking-tighter">Security Kit</h2>
               </div>

               <div className="p-10 bg-yellow-500/5 border border-yellow-500/20 rounded-[2.5rem] text-center space-y-6">
                 <div className="relative inline-block">
                    <div className="absolute inset-0 bg-yellow-500 blur-2xl opacity-10 animate-pulse" />
                    <div className="relative w-20 h-20 bg-yellow-500 rounded-[1.8rem] flex items-center justify-center mx-auto text-black shadow-2xl animate-spin-slow">
                      <ShieldCheck className="w-10 h-10" />
                    </div>
                 </div>
                 <div className="space-y-2">
                   <h3 className="text-2xl font-black italic tracking-tight">{userData?.pin ? 'MPIN Security Protection Active' : 'Initialize operating PIN'}</h3>
                   <p className="text-[8px] text-slate-600 uppercase tracking-wider leading-relaxed">
                     Mandatory 6-digit cryptographic cluster required for all outgoing transfers. Never share.
                   </p>
                 </div>
                 <button onClick={() => setShowPinModal(true)} className="w-full py-5 bg-white text-black font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all text-xs font-bold">
                   {userData?.pin ? 'Modify MPIN Cluster' : 'Initialize MPIN cluster now'}
                 </button>
               </div>
            </motion.div>
          )}

          {/* SECRET HIDDEN ADMIN COMPREHENSIVE CONTROL PANEL */}
          {activeTab === 'admin' && (
            userData?.isAdmin ? (
              <motion.div key="admin" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8 px-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center"><Settings className="w-5 h-5" /></div>
                  <h2 className="text-2xl font-black italic uppercase text-purple-400">SR ADMIN CORE</h2>
                </div>
                <button onClick={() => setActiveTab('home')} className="p-2 hover:bg-white/5 rounded-lg text-slate-500"><X className="w-5 h-5" /></button>
              </div>

              {/* ADMIN GRID METRICS */}
              <section className="grid grid-cols-2 gap-3 text-xs uppercase font-black tracking-widest border-b border-white/5 pb-2">
                <div className="p-5 bg-purple-950/20 border border-purple-500/10 rounded-2xl">
                  <p className="text-[7px] text-slate-500 font-bold mb-1">TOTAL MERCHANTS</p>
                  <p className="text-xl text-purple-400 italic">{adminUsers.length} Nodes</p>
                </div>
                <div className="p-5 bg-purple-950/20 border border-purple-500/10 rounded-2xl">
                  <p className="text-[7px] text-slate-500 font-bold mb-1">HOT BACKEND REFRESHES</p>
                  <p className="text-xl text-emerald-400 italic">5s Live Sync</p>
                </div>
              </section>

              {/* SECURE AUTOMATED BACKUP ENGINE */}
              <section className="p-6 bg-gradient-to-br from-emerald-950/20 to-purple-950/10 border border-emerald-500/15 rounded-[2rem] space-y-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                    <Download className="w-4 h-4 animate-bounce" />
                  </div>
                  <div>
                    <h4 className="text-[10px] font-black uppercase text-emerald-400 tracking-wider">SECURE LIVE SOURCE BACKUP ENGINE</h4>
                    <p className="text-[7px] text-slate-500 uppercase tracking-wider font-bold">Download fully compiled project structure with 1-click</p>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <a 
                    href="/api/download-zip" 
                    download
                    className="w-full flex items-center justify-center gap-2.5 py-4 bg-emerald-600 border border-emerald-500/30 hover:bg-emerald-500 hover:text-black rounded-2xl text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95 shadow-[0_0_20px_rgba(16,185,129,0.15)]"
                  >
                    <Download className="w-4 h-4" />
                    Download Code Backup (.ZIP)
                  </a>
                </div>
                <div className="p-4 bg-black/40 border border-white/5 rounded-xl space-y-1.5 font-mono text-[7px] text-slate-500 leading-normal uppercase">
                  <p className="text-slate-400 font-bold">🚀 Render & Vercel Deployment Instructions:</p>
                  <p>1. Extract the downloaded ZIP or push it directly to your custom GitHub repository.</p>
                  <p>2. Connect your Render / Vercel service to that repository.</p>
                  <p>3. Every time you download a fresh (.ZIP) with new updates, copy/paste the files or upload them to Git, click "Commit" and render will auto-rebuild and live-update within 2 minutes!</p>
                </div>
              </section>

              {/* ADMINISTRATIVE GLOBAL GATEWAY PAYOUTS CONFIGURATION */}
               <section id="global-config-panel-sr" className="p-8 bg-purple-950/15 border border-purple-500/20 rounded-[2.5rem] space-y-6 shadow-[0_0_20px_rgba(168,85,247,0.05)]">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                     <Settings className="w-5 h-5 text-purple-400" />
                   </div>
                   <div>
                     <h4 className="text-md font-black uppercase text-purple-400 tracking-wider">Gateway & Bot Configurations</h4>
                     <p className="text-[8px] text-slate-500 uppercase tracking-widest font-bold">Configure active merchant variables globally</p>
                   </div>
                 </div>

                 <div className="space-y-4">
                   <div className="space-y-1.5 px-1">
                     <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Global UPI ID</label>
                     <input 
                       type="text"
                       value={activeUpiInput}
                       onChange={(e) => setActiveUpiInput(e.target.value)}
                       placeholder="Enter Active UPI Address"
                       className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-xs outline-none focus:border-purple-500 tracking-wider text-white font-mono"
                     />
                   </div>
                   <div className="space-y-1.5 px-1">
                     <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Telegram Bot Token</label>
                     <input 
                       type="text"
                       value={activeBotTokenInput}
                       onChange={(e) => setActiveBotTokenInput(e.target.value)}
                       placeholder="Enter Telegram bot token"
                       className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-xs font-mono outline-none focus:border-purple-500 text-white"
                     />
                   </div>
                   <div className="space-y-1.5 px-1">
                     <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Telegram Bot Username (without @)</label>
                     <input 
                       type="text"
                       value={activeBotUsernameInput}
                       onChange={(e) => setActiveBotUsernameInput(e.target.value)}
                       placeholder="e.g. MySRGatewayBot"
                       className="w-full bg-black border border-white/10 rounded-2xl py-4 px-6 text-xs font-mono outline-none focus:border-purple-500 text-white"
                     />
                   </div>
                    <div className="space-y-1.5 px-1">
                      <label className="text-[9px] font-black uppercase tracking-[0.3em] text-slate-500 italic">Static Deposit QR Code (Image Override)</label>
                      <div className="border border-dashed border-white/10 p-4 rounded-xl bg-black/40 flex flex-col items-center justify-center space-y-2">
                        {activeQrCodeInput ? (
                          <div className="relative">
                            <img src={activeQrCodeInput} alt="Merchant QR" className="w-24 h-24 object-contain rounded-lg border border-white/10" />
                            <button
                              type="button"
                              onClick={() => setActiveQrCodeInput('')}
                              className="absolute -top-1 -right-1 bg-red-600 rounded-full p-1 text-white hover:bg-red-500"
                            >
                              <X className="w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-[9px] text-slate-500 font-bold uppercase animate-pulse">No Static QR override (Generates dynamically via UPI)</p>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleAdminQrFileChange}
                          className="text-xs text-slate-500 file:mr-4 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[8px] file:font-black file:uppercase file:bg-purple-600 file:text-white hover:file:bg-purple-500 cursor-pointer"
                        />
                      </div>
                    </div>
                   <button 
                     onClick={handleSaveGatewayConfig}
                     disabled={processing}
                     className="w-full py-5 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest rounded-2xl shadow-[0_0_20px_rgba(168,85,247,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.6)] transition-all active:scale-95 text-xs font-bold"
                   >
                     {processing ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : "Save Configuration Globals"}
                   </button>
                 </div>
               </section>

              {/* SYSTEM ADMINISTRATIVE DEDICATED SENDER API */}
              <section className="p-8 bg-purple-950/10 border border-purple-500/12 rounded-[2.5rem] space-y-4">
                <h4 className="text-xs font-black uppercase text-purple-400 tracking-widest italic">Automated System Send Money API (GET/POST)</h4>
                <p className="text-[9px] text-slate-400 uppercase tracking-widest leading-relaxed italic font-bold">
                  * Tele-bot integration: Call this API from Telegram to automatically credit money to any user, with dual-side history.
                </p>
                <div className="bg-purple-950/20 border border-purple-500/10 p-5 rounded-2xl overflow-x-auto text-[10px] text-purple-400 font-mono space-y-4">
                  <div>
                    <p className="text-white font-black uppercase text-[8px] tracking-wider mb-1">🎮 Mode 1: Direct System Credit (No Admin Balance Deduct)</p>
                    <code className="text-[9.5px] break-all leading-normal text-purple-300 select-all">
                      {userData?.apiKey 
                        ? `${window.location.origin}/api/system/transfer?key=${userData.apiKey}&number={mobile}&amount={amount}&mode=system`
                        : `${window.location.origin}/api/system/transfer?key=ADMIN_KEY&number={mobile}&amount={amount}&mode=system`}
                    </code>
                  </div>
                  <div className="border-t border-purple-500/10 pt-3">
                    <p className="text-white font-black uppercase text-[8px] tracking-wider mb-1">💼 Mode 2: Wallet Deduct Transfer (Loads funds from Admin Balance)</p>
                    <code className="text-[9.5px] break-all leading-normal text-purple-300 select-all">
                      {userData?.apiKey 
                        ? `${window.location.origin}/api/system/transfer?key=${userData.apiKey}&number={mobile}&amount={amount}&mode=wallet`
                        : `${window.location.origin}/api/system/transfer?key=ADMIN_KEY&number={mobile}&amount={amount}&mode=wallet`}
                    </code>
                  </div>
                </div>
              </section>

              {/* OUTSTANDING PENDING ACTION DESKS (DEPOSITS / WITHDRAWALS) */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 italic px-2">Pending Validation Desks (Admin Action Required)</h3>
                <div className="space-y-3">
                  {adminTransactions.filter(t => t.status === 'pending').map((p) => {
                    const cat = getTransactionCategory(p.type);
                    return (
                      <div key={p.id} className="p-5 bg-[#080808] border border-white/5 rounded-[2rem] space-y-4 text-xs font-bold">
                         <div className="flex justify-between items-start">
                           <div>
                             <span className={cn("text-[7px] px-2 py-0.5 rounded uppercase font-bold", cat.colorClass)}>
                               {cat.label}
                             </span>
                             <h4 className="text-sm font-black italic mt-1.5 text-white">₹{p.amount?.toLocaleString()}</h4>
                             <span className="block text-[8px] text-slate-500 mt-1 uppercase font-mono">User: {p.userName} ({p.mobile})</span>
                             {p.utr && <p className="text-[7px] text-emerald-400 font-mono mt-0.5">UTR Reference_Id: {p.utr}</p>}
                             {p.receiver && <p className="text-[7px] text-blue-400 font-mono mt-0.5">Beneficiary Number: {p.receiver}</p>}
                             {p.screenshot && (
                               <div className="mt-3">
                                 <p className="text-[7px] text-slate-500 uppercase mb-1 font-bold">Attached Screenshot Proof:</p>
                                 <img 
                                   src={p.screenshot} 
                                   alt="Deposit Screenshot" 
                                   className="h-28 w-auto min-w-[120px] object-cover rounded-xl border border-white/10 hover:border-purple-500/50 cursor-pointer shadow-md active:scale-95 transition-transform max-w-full"
                                   onClick={() => setExpandedScreenshot(p.screenshot)}
                                 />
                               </div>
                             )}
                           </div>
                           <div className="flex gap-2">
                             <button onClick={() => handleAdminProcessPayout(p.id || p.id, "reject")} className="p-2 py-1.5 bg-red-600/15 text-red-500 hover:bg-red-600/25 rounded-md text-[8px] uppercase font-black">REJECT</button>
                             <button onClick={() => handleAdminProcessPayout(p.id || p.id, "approve")} className="p-2 py-1.5 bg-emerald-600 border border-emerald-500/20 text-white hover:brightness-110 rounded-md text-[8px] uppercase font-black">APPROVE </button>
                           </div>
                         </div>
                      </div>
                    );
                  })}
                  {adminTransactions.filter(t => t.status === 'pending').length === 0 && (
                    <p className="text-center text-slate-600 text-[10px] uppercase font-bold italic py-8">No pending verifications inside ledger queue.</p>
                  )}
                </div>
              </section>

              {/* ADMINISTRATIVE USERS REGISTRY */}
              <section className="space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 italic px-2">Operational Merchant Registry</h3>
                <div className="space-y-3">
                  {adminUsers.map((u) => (
                    <div key={u.uid} className="p-6 bg-[#080808] border border-white/10 rounded-[2rem] space-y-4 text-xs font-bold">
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="text-sm font-black text-white italic">{u.displayName}</p>
                          <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono">Mobile: {u.mobile} | Key: {u.apiKey}</p>
                        </div>
                        <span className="text-xs font-extrabold text-purple-400 italic bg-purple-500/10 px-3 py-1 rounded-full">
                          ₹{(u.balance || 0).toFixed(2)}
                        </span>
                      </div>

                      <div className="bg-black/50 p-4 rounded-xl border border-white/5 space-y-3">
                        <p className="text-[7px] text-slate-500 tracking-widest font-bold">BALANCE CONFIG CONTROL</p>
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            placeholder="Shift balance"
                            value={adminBalanceInput[u.uid] || ''}
                            onChange={(e) => setAdminBalanceInput(prev => ({ ...prev, [u.uid]: e.target.value }))}
                            className="flex-1 bg-black border border-white/5 px-3 py-2 text-xs font-bold rounded-lg outline-none text-emerald-400"
                          />
                          <button onClick={() => handleAdminBalanceShift(u.uid, "credit")} className="px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[8px] font-black uppercase">CREDIT</button>
                        </div>
                        <div className="flex gap-2">
                          <input 
                            type="number"
                            placeholder="Shift balance"
                            value={adminDebitInput[u.uid] || ''}
                            onChange={(e) => setAdminDebitInput(prev => ({ ...prev, [u.uid]: e.target.value }))}
                            className="flex-1 bg-black border border-white/5 px-3 py-2 text-xs font-bold rounded-lg outline-none text-red-400"
                          />
                          <button onClick={() => handleAdminBalanceShift(u.uid, "debit")} className="px-3 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[8px] font-black uppercase">DEBIT</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-3xs font-extrabold uppercase">
                        <button onClick={() => handleAdminToggleFreeze(u.uid)} className={cn("p-2 rounded-lg border flex items-center justify-center gap-1.5", u.freezeStatus ? "bg-amber-600 border-amber-500 text-white" : "bg-black hover:bg-slate-900 border-white/5 text-slate-400")}>
                          <Lock className="w-3 h-3" /> {u.freezeStatus ? 'UNFREEZE WALLET' : 'FREEZE WALLET'}
                        </button>
                        <button onClick={() => handleAdminToggleApi(u.uid)} className={cn("p-2 rounded-lg border flex items-center justify-center gap-1.5", u.apiStatus === false ? "bg-red-950/40 border-red-500/30 text-red-400" : "bg-black hover:bg-slate-900 border-white/5 text-slate-400")}>
                          <KeyIcon className="w-3 h-3" /> {u.apiStatus === false ? 'ENABLE API' : 'DISABLE API'}
                        </button>
                        <button onClick={() => handleAdminToggleLock(u.uid, !!u.isLocked)} className={cn("p-2 rounded-lg border flex items-center justify-center gap-1.5", u.isLocked ? "bg-red-600 border-red-500 text-white animate-pulse" : "bg-black hover:bg-slate-900 border-white/5 text-slate-400")}>
                          <ShieldCheck className="w-3 h-3" /> {u.isLocked ? 'UNLOCK ACC' : 'LOCK ACC'}
                        </button>
                        <button onClick={() => handleAdminResetMpin(u.uid)} className="p-2 rounded-lg bg-black hover:bg-slate-900 border border-white/5 text-slate-400 flex items-center justify-center gap-1.5">
                          <RefreshCcw className="w-3 h-3" /> RESET MPIN
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* ADMINISTRATIVE CHAT DESK HELPDESK */}
              <section className="p-6 bg-purple-950/10 border border-purple-500/15 rounded-[2.5rem] space-y-4">
                <h3 className="text-[10px] font-black uppercase text-purple-400 tracking-widest px-1 italic">Administrative Chat Hub desk</h3>
                <div className="flex gap-2">
                  <select 
                    onChange={(e) => setSelectedChatUser(adminUsers.find(u => u.uid === e.target.value))}
                    className="flex-1 bg-black border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-purple-500 font-bold"
                  >
                    <option value="">-- Choose User to reply --</option>
                    {adminUsers.map(u => <option key={u.uid} value={u.uid}>{u.displayName} ({u.mobile})</option>)}
                  </select>
                </div>

                {selectedChatUser && (
                  <div className="space-y-3 pt-2">
                    <p className="text-[8px] uppercase tracking-widest text-emerald-400 font-bold">Chat Feed with {selectedChatUser.displayName}:</p>
                    <div className="h-44 bg-black border border-white/5 p-4 rounded-xl overflow-y-auto space-y-2 text-xs font-bold leading-relaxed">
                      {adminChats.filter(c => c.userId === selectedChatUser.uid).map((c, i) => (
                        <div key={i} className={cn("max-w-[80%] p-2.5 rounded-lg", c.sender === 'admin' ? "bg-purple-600 text-white ml-auto" : "bg-white/5 text-white mr-auto border border-white/5")}>
                          <p>{c.message}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={adminChatInput}
                        onChange={(e) => setAdminChatInput(e.target.value)}
                        placeholder="Type reply to merchant..."
                        className="flex-1 bg-black border border-white/10 rounded-xl px-4 text-xs font-bold outline-none text-white"
                      />
                      <button onClick={handleSendAdminReply} className="px-4.5 py-3 bg-purple-600 hover:bg-purple-500 rounded-xl"><Send className="w-4 h-4 text-white" /></button>
                    </div>
                  </div>
                )}
              </section>

              {/* SYSTEM ADMINISTRATIVE GENERATOR OF FREE GIFT CODES */}
              <section className="p-8 bg-[#080808] border border-white/10 rounded-[2.5rem] space-y-4 text-xs font-bold">
                 <h4 className="text-md font-black uppercase tracking-wider text-purple-400 italic">Generate Admin Gift Code (Free Allocation)</h4>
                 <div className="space-y-3">
                   <input 
                     type="number"
                     placeholder="Reward Amount (e.g. 50)"
                     value={createGiftAmount}
                     onChange={(e) => setCreateGiftAmount(e.target.value)}
                     className="w-full bg-black border border-white/5 py-3 px-4 rounded-xl outline-none focus:border-purple-500 text-white"
                   />
                   <input 
                     type="number"
                     placeholder="Clamour Limit (e.g. 1)"
                     value={createGiftLimit}
                     onChange={(e) => setCreateGiftLimit(e.target.value)}
                     className="w-full bg-black border border-white/5 py-3 px-4 rounded-xl outline-none focus:border-purple-500 text-white"
                   />
                   <button onClick={handleCreateGiftCode} className="w-full py-4.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl uppercase font-black tracking-widest text-[10px]">
                     Deploy Code Code
                   </button>
                 </div>
              </section>

              {/* API CALLS HISTORY LEDGER LOGS */}
              <section className="space-y-4 pt-4 border-t border-purple-500/10">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-purple-400 italic px-2">JSON Merchant API Log Audits</h3>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {adminApiLogs.map((l, i) => (
                    <div key={i} className="p-4 bg-[#080808] border border-white/5 rounded-xl flex items-center justify-between text-xs font-mono text-[9px] font-bold">
                      <div className="space-y-1">
                        <span className="text-[7px] text-slate-500 block uppercase font-bold">MERCHANT: {l.merchantName}</span>
                        <p className="text-white">API Call: {l.endpoint}</p>
                        <p className="text-slate-500">Receiver number: {l.receiver}</p>
                      </div>
                      <span className="text-emerald-400 font-extrabold shrink-0 italic">₹{l.amount} OUT</span>
                    </div>
                  ))}
                  {adminApiLogs.length === 0 && <p className="text-center text-slate-600 text-[10px] italic py-4">No API transaction calls logged yet.</p>}
                </div>
              </section>
            </motion.div>
            ) : (
              <motion.div key="admin-denied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-24 px-6 space-y-6 max-w-sm mx-auto">
                <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 text-red-500 rounded-[1.8rem] flex items-center justify-center mx-auto shadow-2xl animate-pulse">
                  <ShieldCheck className="w-10 h-10 text-red-500" />
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black italic tracking-tight text-white mb-2">ACCESS DIRECTIVE</h3>
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest leading-relaxed">
                    Registered administrative status on SR GATEWAY is required to operate this console.
                  </p>
                </div>
                <button 
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  className="w-full py-5 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-2xl shadow-xl active:scale-95 transition-all text-xs font-bold"
                >
                  Return to Merchant Portal
                </button>
              </motion.div>
            )
          )}
        </AnimatePresence>

        <section className="pt-16 space-y-8 border-t border-white/5 opacity-85 text-xs font-bold text-slate-400">
          <div className="flex items-center justify-between px-3">
            <h4 className="text-[9px] font-black uppercase text-slate-700 tracking-[0.4em] italic flex items-center gap-3">
              <ShieldCheck className="w-3.5 h-3.5 text-yellow-500/50" /> SR Gateway Security Node
            </h4>
            <div className="flex items-center gap-5 shrink-0">
               <a href={SUPPORT_LINK} target="_blank" className="p-3 bg-yellow-500/5 text-yellow-500/40 rounded-xl hover:bg-yellow-500/10 transition-all border border-yellow-500/10">
                  <Smartphone className="w-4 h-4" />
               </a>
               <a href={OFFICIAL_CHANNEL} target="_blank" className="p-3 bg-white/5 text-slate-600 rounded-xl hover:bg-white/10 transition-all border border-white/10">
                  <ExternalLink className="w-4 h-4" />
               </a>
            </div>
          </div>
          <div className="p-6 bg-white/5 rounded-[2rem] border border-white/5 text-center shadow-inner">
            <p className="text-[7px] font-black text-slate-900 uppercase tracking-[0.6em] italic">Proprietary Core • SR Gateway Ecosystem • Zero Logs Persistence</p>
          </div>
        </section>
      </main>

      {/* SECURE WALLET TRANSFER POPUP MODAL */}
      <AnimatePresence>
        {showTransferModal && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTransferModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 150 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 150 }} className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[3rem] p-10 shadow-2xl text-xs font-bold">
              <div className="text-center space-y-6">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto text-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.25)] border border-emerald-500/20">
                  <Send className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black italic uppercase text-white">User to User</h3>
                <div className="space-y-3 text-left">
                  <input 
                    type="text"
                    placeholder="Mobile Number Dalo"
                    value={transferMobile}
                    onChange={(e) => setTransferMobile(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full bg-black border border-white/5 py-4 px-5 rounded-xl outline-none text-white tracking-widest font-mono"
                  />
                  <input 
                    type="number"
                    placeholder="Amount Dalo"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full bg-black border border-white/5 py-4 px-5 rounded-xl outline-none text-emerald-400 font-black text-lg"
                  />
                  <input 
                    type="password"
                    maxLength={6}
                    placeholder="Mpin Dalo"
                    value={transferMpin}
                    onChange={(e) => setTransferMpin(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-black border border-white/5 py-4 px-5 rounded-xl outline-none text-center text-yellow-500 font-mono tracking-widest text-lg"
                  />
                </div>
                <button 
                  onClick={handleWalletTransfer}
                  disabled={processing}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white uppercase tracking-widest font-black rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.25)] active:scale-95 transition-all"
                >
                  User to User
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE GIFT CODE MODAL */}
      <AnimatePresence>
        {showCreateGiftModal && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateGiftModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 150 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 150 }} className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[3rem] p-10 shadow-2xl text-xs font-bold space-y-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-2xl flex items-center justify-center mx-auto text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)] border border-yellow-500/20"><Gift className="w-8 h-8" /></div>
                <h3 className="text-xl font-black italic uppercase text-white">Gift Code Create</h3>
              </div>
              <div className="space-y-3 text-left">
                <input 
                  type="number"
                  placeholder="Amount Dalo"
                  value={createGiftAmount}
                  onChange={(e) => setCreateGiftAmount(e.target.value)}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-yellow-500"
                />
                <input 
                  type="number"
                  placeholder="Total claims limit (e.g. 1)"
                  value={createGiftLimit}
                  onChange={(e) => setCreateGiftLimit(e.target.value)}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-white"
                />
                <input 
                  type="password"
                  maxLength={6}
                  placeholder="Mpin Dalo"
                  value={createGiftMpin}
                  onChange={(e) => setCreateGiftMpin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-center font-mono tracking-widest text-lg"
                />
              </div>
              <button onClick={handleCreateGiftCode} className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black uppercase tracking-widest font-black rounded-xl shadow-[0_0_15px_rgba(234,179,8,0.25)] active:scale-95 transition-all">
                Gift Code Create
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CREATE LIFAFA CAMPAIGN MODAL */}
      <AnimatePresence>
        {showCreateLifafaModal && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowCreateLifafaModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 150 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 150 }} className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[3rem] p-10 shadow-2xl text-xs font-bold space-y-6">
              <div className="text-center space-y-4">
                <div className="w-16 h-16 bg-red-500/10 rounded-2xl flex items-center justify-center mx-auto text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)] border border-red-500/20"><Sparkles className="w-8 h-8" /></div>
                <h3 className="text-xl font-black italic uppercase text-white">Lifafa Create</h3>
              </div>
              <div className="space-y-3 text-left">
                <input 
                  type="number"
                  placeholder="Amount Dalo"
                  value={createLifafaAmount}
                  onChange={(e) => setCreateLifafaAmount(e.target.value)}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-red-400"
                />
                <input 
                  type="number"
                  placeholder="Total Claimers Limit (e.g. 10)"
                  value={createLifafaLimit}
                  onChange={(e) => setCreateLifafaLimit(e.target.value)}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-white"
                />
                <select 
                  value={createLifafaType}
                  onChange={(e) => setCreateLifafaType(e.target.value as any)}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-white font-bold"
                >
                  <option value="fixed">Fixed Pool (Each user gets equal share)</option>
                  <option value="random">Luck Pool (Each user gets random prize size)</option>
                </select>
                <input 
                  type="password"
                  maxLength={6}
                  placeholder="Mpin Dalo"
                  value={createLifafaMpin}
                  onChange={(e) => setCreateLifafaMpin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-black border border-white/5 py-3.5 px-4 rounded-xl outline-none text-center font-mono tracking-widest text-lg animate-pulse"
                />
              </div>
              <button onClick={handleCreateLifafa} className="w-full py-4 bg-red-600 hover:bg-red-500 text-white uppercase tracking-widest font-black rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.25)] active:scale-95 transition-all">
                Lifafa Create
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* GLOBAL ALERTS LOGS */}
      <div className="fixed bottom-28 left-6 right-6 z-[120] pointer-events-none space-y-4">
        <AnimatePresence>
          {error && (
            <motion.div key="err" initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="p-5 bg-red-600 text-white rounded-[2rem] shadow-2xl flex items-center gap-4 font-black text-[10px] uppercase tracking-[0.1em] pointer-events-auto">
              <div className="p-2 bg-black/20 rounded-full shrink-0"><AlertCircle className="w-5 h-5" /></div>
              <p className="flex-1 leading-relaxed italic">{error}</p>
              <button onClick={() => setError(null)} className="p-1.5 hover:bg-white/10 rounded-full font-mono text-sm">✕</button>
            </motion.div>
          )}
          {success && (
            <motion.div key="succ" initial={{ opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="p-5 bg-emerald-600 text-white rounded-[2rem] shadow-2xl flex items-center gap-4 font-black text-[10px] uppercase tracking-[0.1em] pointer-events-auto">
              <div className="p-2 bg-black/20 rounded-full shrink-0"><Check className="w-5 h-5" /></div>
              <p className="flex-1 leading-relaxed italic">{success}</p>
              <button onClick={() => setSuccess(null)} className="p-1.5 hover:bg-white/10 rounded-full font-mono text-sm">✕</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* THREE-LINE HAMBURGER SLIDE OUT DRAWER */}
      <AnimatePresence>
        {showMenu && (
          <div className="fixed inset-0 z-[115] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
              onClick={() => setShowMenu(false)} 
              className="absolute inset-0 bg-black/85 backdrop-blur-md" 
            />
            <motion.div 
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }} 
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-sm h-full bg-[#080808] border-l border-white/10 p-8 shadow-2xl flex flex-col justify-between overflow-y-auto"
            >
              <div className="space-y-8">
                <div className="flex items-center justify-between border-b border-white/5 pb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-yellow-500 rounded-xl flex items-center justify-center text-black font-black italic">
                      {userData?.displayName?.charAt(0) || 'S'}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-white italic">{userData?.displayName || 'Merchant Partner'}</h3>
                      <p className="text-[8px] text-slate-500 uppercase tracking-widest font-mono font-bold">{userData?.mobile}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowMenu(false)} 
                    className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <p className="text-[8px] text-slate-500 font-black uppercase tracking-[0.25em] px-1 italic">Operations Dashboard</p>
                  
                  <button 
                    onClick={() => { setActiveTab('api'); setShowMenu(false); }}
                    className="w-full p-4.5 bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/15 rounded-2xl flex items-center gap-4 transition-all text-left shadow-[0_0_12px_rgba(234,179,8,0.1)] group hover:border-yellow-500/30 font-bold"
                  >
                    <div className="p-2 bg-yellow-500/15 rounded-lg text-yellow-500"><KeyIcon className="w-4 h-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-wider text-yellow-500">API Key Setting</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Integration keys & full setup guide</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setShowTelegramModal(true); setShowMenu(false); }}
                    className="w-full p-4.5 bg-sky-500/5 hover:bg-sky-500/10 border border-sky-500/15 rounded-2xl flex items-center gap-4 transition-all text-left shadow-[0_0_12px_rgba(14,165,233,0.15)] group hover:border-sky-500/30 font-bold"
                  >
                    <div className="p-2 bg-sky-500/15 rounded-lg text-sky-400"><Send className="w-4 h-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-wider text-sky-400">Telegram Bot Alert</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Link personal Telegram Bot alerts</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setShowPrivacyModal(true); setShowMenu(false); }}
                    className="w-full p-4.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-4 transition-all text-left group font-bold"
                  >
                    <div className="p-2 bg-white/5 rounded-lg text-slate-300"><ShieldCheck className="w-4 h-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-wider text-white">Privacy Policy</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Secure cryptography & credentials laws</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setShowTermsModal(true); setShowMenu(false); }}
                    className="w-full p-4.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-4 transition-all text-left group font-bold"
                  >
                    <div className="p-2 bg-white/5 rounded-lg text-slate-300"><AlertCircle className="w-4 h-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-wider text-white">Terms & Conditions</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Peer-to-peer compliance codes</p>
                    </div>
                  </button>

                  <button 
                    onClick={() => { setActiveTab('profile'); setShowMenu(false); }}
                    className="w-full p-4.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl flex items-center gap-4 transition-all text-left group font-bold"
                  >
                    <div className="p-2 bg-white/5 rounded-lg text-slate-300"><UserIcon className="w-4 h-4" /></div>
                    <div>
                      <p className="text-[10px] uppercase font-black tracking-wider text-white">My Account</p>
                      <p className="text-[8px] text-slate-400 font-bold uppercase mt-0.5">Disbursement levels & settings</p>
                    </div>
                  </button>
                </div>
              </div>

              <div className="pt-8 border-t border-white/5 space-y-3">
                <button 
                  onClick={() => { handleLogOut(); setShowMenu(false); }}
                  className="w-full py-4 border border-red-500/30 bg-red-500/5 hover:bg-red-500/20 text-red-500 rounded-xl font-black uppercase text-[10px] tracking-wider transition-all shadow-[0_0_15px_rgba(239,68,68,0.2)] active:scale-95 flex items-center justify-center gap-2 font-bold"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out
                </button>
                <p className="text-[6.5px] uppercase tracking-widest text-slate-700 font-black text-center italic font-bold">SR GATEWAY MULTI-NODE INSTANCE • LIVE</p>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PRIVACY POLICY SUBMODAL */}
      <AnimatePresence>
        {showPrivacyModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPrivacyModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6 text-xs max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-black uppercase italic tracking-tighter text-white">Privacy Protocol</h3>
                </div>
                <button onClick={() => setShowPrivacyModal(false)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4 font-normal text-slate-300 leading-relaxed text-[11px] uppercase tracking-wide">
                <p className="font-extrabold text-white text-xs">1. CRYPTOGRAPHIC DATA INTEGRITY</p>
                <p>SR GATEWAY IMPLEMENTS STATE-OF-THE-ART END-TO-END LEDGER SEGREGATION. YOUR REGISTERED MOBILE NUMBERS, OPERATIVE HASH KEYS, AND DISBURSEMENT LOGS ARE LOCATED SECURELY WITH PURE CLIENT AUTH DATA FLOWS.</p>
                <p className="font-extrabold text-white text-xs">2. SECURITY PASSKEYS (MPIN)</p>
                <p>YOUR SIX-DIGIT MPIN IS SALTED, CRYPTOGRAPHICALLY HASHED, AND LOCKED LOCAL-SIDE ON NODE SUB-LAYERS. SYSTEM ADMINISTRATORS CORRELATING SECURITY CHECKS CAN NEVER ACCESS YOUR CLEAN RECOVERABLE PIN LABELS IN READABLE LAYOUTS.</p>
                <p className="font-extrabold text-white text-xs">3. AUTOMATED API SEGREGATION</p>
                <p>MERCHANT DISBURSEMENT KEYS OPERATING ON DISPATCH TRAFFIC PASS DUAL-LAYER SECURITY CHECKS. TRANSACTION RECORDS HARVESTED FROM DISBURSAL TO BOT PROTOCOLS RESIDE EXCLUSIVELY WITHIN THE DEPLOYED STORAGE POOL.</p>
              </div>
              <button onClick={() => setShowPrivacyModal(false)} className="w-full py-4.5 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl active:scale-95 transition-all shadow-md font-bold">
                Acknowledge Privacy Policy
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* TERMS & CONDITIONS SUBMODAL */}
      <AnimatePresence>
        {showTermsModal && (
          <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTermsModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6 text-xs max-h-[85vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <h3 className="text-lg font-black uppercase italic tracking-tighter text-white">Terms of Operations</h3>
                </div>
                <button onClick={() => setShowTermsModal(false)} className="p-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-4 font-normal text-slate-300 leading-relaxed text-[11px] uppercase tracking-wide">
                <p className="font-extrabold text-white text-xs">1. LIQUIDITY DEPOSITS & FEES</p>
                <p>LOAD FUND DEPOSITS MUST SPECIFY STABLE AND REAL 12-DIGIT TRANSACTION REFERENCE NUMBERS (UTR). FICTITIOUS LOAD CLAIMS TRIGGER SECURITY HOLDS AND POTENTIAL HARMONIC BLOCK STATE DYNAMICS.</p>
                <p className="font-extrabold text-white text-xs">2. EQUALIZER LIFAFA DROP SYSTEM</p>
                <p>USER-HOSTED LUCKY ENVELOPE FUNDS ARE CARRIED OUT INSTANTLY. CREATOR BALANCE IS REMOVED IMMEDIATELY UPON LAUNCH IN COMPLIANCE WITH REAL TIME DISBURSAL AND FRACTIONAL ALLOCATOR CHECKS.</p>
                <p className="font-extrabold text-white text-xs">3. PEER-TO-PEER COMPLIANCE RULES</p>
                <p>P2P TRANSFERS ON ALL ACTIVE NODES REQUIRE EXPRESS CONSENT AND VERIFICATION WITH THE RECIPIENT. COMPLETED LEDGER RECTIFICATIONS CANNOT BE REVOKED, RE-DRAFTED, OR COMPROMISED FROM LOCAL SIDE SYSTEMS.</p>
              </div>
              <button onClick={() => setShowTermsModal(false)} className="w-full py-4.5 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest text-[10px] rounded-2xl active:scale-95 transition-all shadow-md font-bold">
                Accept Operational Terms
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PASSKEY MPIN VERIFICATION MODAL */}
      <AnimatePresence>
        {showPinModal && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowPinModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div initial={{ opacity: 0, y: 150, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 150, scale: 0.8 }} className="relative w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[3.5rem] p-12 shadow-2xl text-xs font-bold text-center">
              <div className="space-y-6">
                <div className="relative inline-block">
                  <div className="absolute inset-0 bg-yellow-500 blur-2xl opacity-10 animate-pulse" />
                  <div className="relative w-16 h-16 bg-yellow-500 rounded-2xl flex items-center justify-center mx-auto text-black">
                    <ShieldCheck className="w-8 h-8" />
                  </div>
                </div>
                <div>
                   <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Verification Authorized Required</h3>
                   <p className="text-[8px] font-black text-slate-500 uppercase tracking-widest mt-1.5 italic">Confirm 6-Digit security passkey</p>
                </div>
                <div className="relative">
                  <input 
                    type="password" 
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Mpin Dalo"
                    className="w-full bg-black/40 border border-white/10 rounded-xl py-5 text-center text-3xl font-black tracking-[0.5em] outline-none focus:border-yellow-500 transition-all text-yellow-500 placeholder:text-white/5 font-mono"
                    autoFocus
                  />
                </div>
                <button 
                  onClick={verifyPin}
                  className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black uppercase tracking-widest rounded-xl text-2xs shadow-[0_0_15px_rgba(234,179,8,0.2)]"
                >
                  Mpin Dalo
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* PERSONAL TELEGRAM BOT ALERTS CONFIGURATION MODAL */}
      <AnimatePresence>
        {showTelegramModal && (
          <div className="fixed inset-0 z-[125] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowTelegramModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }} 
              className="relative w-full max-w-sm bg-[#0A0A0A] border border-white/10 rounded-[2.5rem] p-8 shadow-2xl space-y-6 text-xs text-center"
            >
              <div className="space-y-4">
                <div className="relative inline-block mx-auto">
                  <div className="absolute inset-0 bg-sky-500 blur-2xl opacity-15 animate-pulse rounded-full" />
                  <div className="relative w-16 h-16 bg-sky-500 rounded-2xl flex items-center justify-center mx-auto text-black shadow-[0_0_20px_rgba(14,165,233,0.3)]">
                    <Send className="w-8 h-8 animate-wiggle" />
                  </div>
                </div>
                <div>
                  <h3 className="text-xl font-black italic uppercase tracking-tighter text-white">Telegram Alerts Connector</h3>
                  <p className="text-[8px] font-black text-sky-400 uppercase tracking-widest mt-1.5 italic">Real-Time account receipts & ledgers</p>
                </div>
              </div>

              {userData?.telegramChatId ? (
                <div className="bg-sky-500/5 border border-sky-500/10 p-5 rounded-2xl text-left space-y-3 font-bold text-slate-300">
                  <p className="text-[10px] text-emerald-400 uppercase tracking-wider text-center">🎉 Connection State: ACTIVE</p>
                  <p className="text-[9px] uppercase leading-relaxed text-center">
                    Your account is fully synchronized under Chat ID <code>{userData.telegramChatId}</code>.
                  </p>
                  <p className="text-[8px] text-slate-500 uppercase text-center">
                    To connect to a different chat, overwrite the Chat ID below.
                  </p>
                </div>
              ) : (
                <div className="bg-amber-500/5 border border-amber-500/10 p-5 rounded-2xl text-left space-y-1 font-semibold text-slate-400 leading-normal">
                  <p className="text-[9px] uppercase font-black text-amber-500 tracking-wider">⚡ Setup Procedure:</p>
                  <p>1. Open Telegram & search for Bot Username: <a href={`https://t.me/${gatewayConfig.telegramBotUsername}`} target="_blank" className="text-sky-400 underline font-mono">@{gatewayConfig.telegramBotUsername}</a></p>
                  <p>2. Send the command <code className="text-white">/start</code> to initialize bot connection.</p>
                  <p>3. Enter your chat ID (obtainable from bots like @userinfobot) below to complete linking!</p>
                </div>
              )}

              <div className="space-y-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase tracking-widest px-1 text-slate-500">Your Telegram Chat ID</label>
                  <input 
                    type="text" 
                    value={tempTelegramChatId}
                    onChange={(e) => setTempTelegramChatId(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter Telegram Chat ID"
                    className="w-full bg-black border border-white/10 rounded-2xl py-4.5 px-6 outline-none focus:border-sky-500 font-bold text-center tracking-widest text-lg font-mono text-white shadow-inner placeholder:text-slate-800 animate-pulse"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button 
                    onClick={() => setShowTelegramModal(false)}
                    className="flex-1 py-4.5 border border-white/10 hover:bg-white/5 rounded-2xl font-black uppercase tracking-widest text-[9px] text-slate-400 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveTelegramId}
                    disabled={processing || !tempTelegramChatId}
                    className="flex-1 py-4.5 bg-sky-500 hover:bg-sky-400 text-black font-black uppercase tracking-widest rounded-2xl text-[9px] shadow-[0_0_15px_rgba(14,165,233,0.35)] transition-all active:scale-95 disabled:opacity-50"
                  >
                    {processing ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Save & Verify"}
                  </button>
                </div>
              </div>

              {gatewayConfig.telegramBotUsername && (
                <div className="pt-2 border-t border-white/5 text-center">
                  <a 
                    href={`https://t.me/${gatewayConfig.telegramBotUsername}`} 
                    target="_blank" 
                    className="text-[9px] text-sky-400 hover:underline font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                  >
                    🔗 Go to Bot: @{gatewayConfig.telegramBotUsername}
                  </a>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FULL SCREEN ADMINISTRATIVE IMAGE VIEWER SUBMODAL */}
      <AnimatePresence>
        {expandedScreenshot && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setExpandedScreenshot(null)} className="absolute inset-0 bg-black/98 backdrop-blur-md" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.9 }} 
              className="relative max-w-2xl w-full max-h-[85vh] rounded-[2rem] overflow-hidden bg-[#050505] border border-white/10 flex flex-col items-center shadow-2xl p-4 gap-4"
            >
              <div className="w-full flex justify-between items-center px-4 pt-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 italic font-bold">Receipt Screenshot Proof</span>
                <button onClick={() => setExpandedScreenshot(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-slate-400 hover:text-white transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="w-full flex-1 max-h-[70vh] flex items-center justify-center p-2">
                <img 
                  src={expandedScreenshot} 
                  alt="Full-sized receipt proof screenshot" 
                  className="max-h-[68vh] max-w-full object-contain rounded-xl border border-white/5 shadow-2xl" 
                />
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* CORE BOTTOM NAVIGATION DOCKED FOOTER */}
      {!isAdminPathActive && (
        <nav className="fixed bottom-0 left-0 right-0 h-24 bg-black/95 backdrop-blur-3xl border-t border-white/10 z-[100]">
          <div className="max-w-lg mx-auto h-full px-10 flex items-center justify-between">
             {[
               { id: 'home', icon: Wallet },
               { id: 'history', icon: History },
               { id: 'deposit', icon: Plus },
               { id: 'profile', icon: UserIcon },
             ].map(item => (
               <button 
                 key={item.id} 
                 onClick={() => setActiveTab(item.id)}
                 className={cn(
                   "p-4 rounded-2xl transition-all relative group",
                   activeTab === item.id ? "text-yellow-500" : "text-slate-800 hover:text-slate-500"
                 )}
               >
                 <item.icon className={cn("w-7 h-7 transition-transform group-active:scale-95", activeTab === item.id ? "drop-shadow-[0_0_15px_rgba(0,210,255,0.3)] text-yellow-500" : "text-slate-500")} />
                 {activeTab === item.id && (
                   <>
                     <motion.div layoutId="nav-glow-final-sr" className="absolute inset-2 bg-yellow-500/10 blur-xl rounded-full" />
                     <motion.div layoutId="nav-indicator-sr" className="absolute -top-1 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-yellow-500 rounded-full shadow-[0_0_10px_#00d2ff]" />
                   </>
                 )}
               </button>
             ))}
          </div>
        </nav>
      )}
    </div>
  );
}
