/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  APIProvider, 
  Map, 
  AdvancedMarker, 
  Pin, 
  useMap, 
  useMapsLibrary,
  useAdvancedMarkerRef,
  InfoWindow
} from '@vis.gl/react-google-maps';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  setDoc,
  getDocs,
  getDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Map as MapIcon, 
  Plus, 
  Calendar, 
  Compass, 
  Settings, 
  LogOut, 
  Search, 
  Clock, 
  ChevronRight,
  CheckCircle2,
  StickyNote,
  Trash2,
  Image as ImageIcon,
  Heart,
  ChevronDown,
  Navigation,
  PlaneTakeoff,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { auth, db, signInWithGoogle, logout, OperationType, handleFirestoreError, testConnection } from './lib/firebase';
import { generateItinerary, DayItinerary, ITineraryEvent } from './lib/ai';
import { cn } from './lib/utils';

const MAPS_API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidMapsKey = Boolean(MAPS_API_KEY);

// --- Components ---

function SetupInstructions() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-stone-50 p-6 font-sans">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-sm border border-stone-200">
        <h2 className="text-2xl font-semibold text-stone-900 mb-4">Google Maps API Key Required</h2>
        <div className="space-y-4 text-stone-600 text-sm leading-relaxed">
          <p>This app needs a Google Maps Platform key to display maps and locations.</p>
          <ol className="list-decimal list-inside space-y-2">
            <li><a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-stone-900 font-medium underline underline-offset-4">Get an API Key</a></li>
            <li>Add your key as a secret in AI Studio:</li>
            <ul className="ml-5 list-disc space-y-1 opacity-80">
              <li>Open <strong>Settings</strong> (⚙️ gear icon)</li>
              <li>Select <strong>Secrets</strong></li>
              <li>Add <code>GOOGLE_MAPS_PLATFORM_KEY</code></li>
            </ul>
          </ol>
          <p className="mt-4 pt-4 border-t border-stone-100 flex items-center gap-2 text-xs italic">
            <AlertCircle size={14} /> The app will rebuild automatically after you add the secret.
          </p>
        </div>
      </div>
    </div>
  );
}

function MarkerWithInfo({ activity }: { activity: ITineraryEvent }) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [open, setOpen] = useState(false);

  return (
    <React.Fragment>
      <AdvancedMarker
        ref={markerRef}
        position={activity.location}
        onClick={() => setOpen(true)}
      >
        <Pin background="#1c1917" glyphColor="#fff" borderColor="#44403c" scale={0.9} />
      </AdvancedMarker>
      {open && (
        <InfoWindow anchor={marker} onCloseClick={() => setOpen(false)}>
          <div className="p-1 max-w-[200px]">
            <h3 className="font-semibold text-stone-900">{activity.title}</h3>
            <p className="text-xs text-stone-500 mt-1">{activity.time}</p>
            <p className="text-xs text-stone-600 mt-2 line-clamp-2">{activity.description}</p>
          </div>
        </InfoWindow>
      )}
    </React.Fragment>
  );
}

function MapView({ itinerary }: { itinerary: DayItinerary[] }) {
  const map = useMap();
  const allActivities = itinerary.flatMap(day => day.activities);

  useEffect(() => {
    if (!map || allActivities.length === 0) return;
    const bounds = new google.maps.LatLngBounds();
    allActivities.forEach(item => bounds.extend(item.location));
    map.fitBounds(bounds, { top: 100, right: 300, bottom: 100, left: 100 });
  }, [map, allActivities]);

  return (
    <Map
      defaultCenter={{ lat: 0, lng: 0 }}
      defaultZoom={2}
      mapId="VOYAGER_MAP"
      internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
      className="w-full h-full"
      disableDefaultUI={true}
      zoomControl={true}
    >
      {allActivities.map((activity, idx) => (
        <React.Fragment key={idx}>
          <MarkerWithInfo activity={activity} />
        </React.Fragment>
      ))}
    </Map>
  );
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTrip, setCurrentTrip] = useState<any>(null);
  const [itinerary, setItinerary] = useState<DayItinerary[]>([]);
  const [savedTrips, setSavedTrips] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [activeView, setActiveView] = useState<'planner' | 'history' | 'settings'>('planner');
  const [packingList, setPackingList] = useState<{ item: string; checked: boolean }[]>([]);
  const [notes, setNotes] = useState('');
  const [activeTab, setActiveTab] = useState<'itinerary' | 'packing' | 'notes'>('itinerary');
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Featured Destinations for "Discovery"
  const featuredDestinations = [
    { title: "Amalfi Coast", img: "https://images.unsplash.com/photo-1533104816931-20fa691ff6ca?auto=format&fit=crop&q=80&w=800", theme: "beach" },
    { title: "Swiss Alps", img: "https://images.unsplash.com/photo-1531310197839-ccf54624b09f?auto=format&fit=crop&q=80&w=800", theme: "mountain" },
    { title: "Kyoto", img: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=800", theme: "culture" }
  ];

  // Form State
  const [formData, setFormData] = useState({
    destination: '',
    days: 3,
    budget: 'moderate',
    interests: [] as string[]
  });

  useEffect(() => {
    // Test connection on boot
    testConnection();

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'trips'), where('userId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const trips = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSavedTrips(trips);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'trips');
    });
    return () => unsubscribe();
  }, [user]);

  const handleSignIn = async () => {
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch (error: any) {
      setAuthError(error.message || "Failed to sign in. Please check your browser's popup blocker.");
      console.error("Sign in failed", error);
    }
  };

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const data = await generateItinerary(
        formData.destination,
        formData.days,
        formData.budget,
        formData.interests
      );
      
      const tripRef = await addDoc(collection(db, 'trips'), {
        userId: user.uid,
        destination: formData.destination,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        budget: formData.budget,
        preferences: { interests: formData.interests },
        createdAt: serverTimestamp()
      });

      await setDoc(doc(db, 'itineraries', tripRef.id), {
        tripId: tripRef.id,
        days: data
      });

      setItinerary(data);
      setCurrentTrip({ id: tripRef.id, ...formData });
      setShowForm(false);
      setActiveView('planner');
    } catch (error: any) {
      console.error("Generation failed:", error);
      let userMsg = "We couldn't map your journey right now. Please try again later.";
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.error?.includes('Insufficient permissions')) {
          userMsg = "Access denied. Please check your account permissions.";
        }
      } catch (e) {
        // Fallback for non-JSON errors
      }
      setErrorMessage(userMsg);
    } finally {
      setIsGenerating(false);
    }
  };

  const loadTrip = async (trip: any) => {
    setCurrentTrip(trip);
    setActiveView('planner');
    setPackingList(trip.packingList || []);
    setNotes(trip.notes || '');
    setActiveTab('itinerary');
    try {
      const itenDoc = await getDoc(doc(db, 'itineraries', trip.id));
      if (itenDoc.exists()) {
        setItinerary(itenDoc.data().days);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `itineraries/${trip.id}`);
    }
  };

  const handleExport = () => {
    if (!currentTrip) return;
    const content = JSON.stringify({ trip: currentTrip, itinerary }, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itinerary-${currentTrip.destination.replace(/\s+/g, '-').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Trip to ${currentTrip?.destination}`,
        text: `Check out my travel itinerary for ${currentTrip?.destination}!`,
        url: window.location.href
      }).catch(console.error);
    } else {
      navigator.clipboard.writeText(window.location.href);
      alert('Link copied to clipboard!');
    }
  };

  const updateTripData = async (updates: any) => {
    if (!currentTrip) return;
    try {
      await setDoc(doc(db, 'trips', currentTrip.id), updates, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `trips/${currentTrip.id}`);
    }
  };

  const handleTogglePacking = (index: number) => {
    const newList = [...packingList];
    newList[index].checked = !newList[index].checked;
    setPackingList(newList);
    updateTripData({ packingList: newList });
  };

  const handleAddPacking = (item: string) => {
    if (!item.trim()) return;
    const newList = [...packingList, { item, checked: false }];
    setPackingList(newList);
    updateTripData({ packingList: newList });
  };

  const handleRemovePacking = (index: number) => {
    const newList = packingList.filter((_, i) => i !== index);
    setPackingList(newList);
    updateTripData({ packingList: newList });
  };

  const handleSaveNotes = (val: string) => {
    setNotes(val);
    updateTripData({ notes: val });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-stone-50">
        <Loader2 className="animate-spin text-stone-400" size={32} />
      </div>
    );
  }

  if (!hasValidMapsKey) {
    return <SetupInstructions />;
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-stone-950 text-white p-6 relative overflow-hidden">
        {/* Background Overlay Image */}
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=2000" 
            alt="Hero"
            className="w-full h-full object-cover opacity-40 scale-105 blur-[2px]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-stone-950/40 to-transparent" />
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="z-10 text-center max-w-lg"
        >
          <div className="flex justify-center mb-8">
            <div className="w-20 h-20 rounded-[2.5rem] bg-white/10 backdrop-blur-xl flex items-center justify-center border border-white/20 shadow-2xl">
              <Navigation size={40} className="text-white" />
            </div>
          </div>
          <h1 className="text-7xl font-bold tracking-tighter mb-4 italic">Voyager</h1>
          <p className="text-stone-300 text-xl mb-12 leading-relaxed font-light max-w-md mx-auto">
            Design your ideal escape with AI-driven intelligence and global insights.
          </p>
          
          {authError && (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle size={18} />
              {authError}
            </div>
          )}

          <button 
            onClick={handleSignIn}
            className="group px-10 py-5 bg-white text-stone-950 rounded-full font-bold transition-all hover:bg-stone-100 hover:scale-105 active:scale-95 flex items-center gap-3 mx-auto shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            Start Your Journey
            <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={MAPS_API_KEY} version="weekly">
      <div className="flex flex-col h-screen bg-white overflow-hidden font-sans">
        
        {/* Top Navigation Bar */}
        <header className="h-20 border-b border-stone-100 bg-white px-8 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-12">
            <div 
              className="flex items-center gap-2 cursor-pointer group" 
              onClick={() => { setActiveView('planner'); setCurrentTrip(null); setItinerary([]); }}
            >
              <div className="w-10 h-10 bg-stone-950 rounded-2xl flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                <Navigation size={20} />
              </div>
              <span className="text-2xl font-bold tracking-tighter italic text-stone-950">Voyager</span>
            </div>

            <nav className="hidden md:flex items-center gap-8">
              <button 
                onClick={() => setActiveView('planner')}
                className={cn(
                  "text-sm font-semibold transition-all px-1 py-2 border-b-2",
                  activeView === 'planner' ? "text-stone-950 border-stone-950" : "text-stone-400 border-transparent hover:text-stone-600"
                )}
              >
                Discover
              </button>
              <button 
                onClick={() => setActiveView('history')}
                className={cn(
                  "text-sm font-semibold transition-all px-1 py-2 border-b-2",
                  activeView === 'history' ? "text-stone-950 border-stone-950" : "text-stone-400 border-transparent hover:text-stone-600"
                )}
              >
                My Journeys
              </button>
            </nav>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
               <button 
                onClick={() => setActiveView('settings')}
                className={cn(
                  "p-2 rounded-full transition-colors",
                  activeView === 'settings' ? "bg-stone-100 text-stone-950" : "text-stone-400 hover:bg-stone-50 hover:text-stone-950"
                )}
              >
                <Settings size={20} />
              </button>
              <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center overflow-hidden border border-stone-200">
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Compass size={20} className="text-stone-400" />
                )}
              </div>
            </div>
            <button 
              onClick={logout}
              className="p-2 text-stone-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <LogOut size={20} />
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 flex overflow-hidden relative">
          
          {/* Planner View with Discovery / Itinerary */}
          {activeView === 'planner' && (
            <div className="flex-1 flex overflow-hidden">
              
              {/* Trip Selection / Creation Sidebar (Only if Itinerary is active) */}
              <AnimatePresence mode="wait">
                {itinerary.length > 0 && (
                  <motion.div 
                    key="planner-sidebar"
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 380, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    className="border-r border-stone-100 bg-white flex flex-col overflow-hidden"
                  >
                    <div className="p-6 border-b border-stone-50 flex items-center justify-between min-w-[380px]">
                      <h2 className="text-lg font-bold text-stone-950 tracking-tight">Recent Plans</h2>
                      <button 
                        onClick={() => { setItinerary([]); setCurrentTrip(null); setShowForm(true); }}
                        className="p-2 rounded-xl bg-stone-50 text-stone-950 hover:bg-stone-100 transition-colors"
                      >
                        <Plus size={18} />
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar min-w-[380px]">
                      <div className="px-6 py-4 space-y-3">
                        {savedTrips.map((trip: any) => (
                          <motion.div 
                            key={trip.id}
                            whileHover={{ x: 4 }}
                            onClick={() => loadTrip(trip)}
                            className={cn(
                              "p-4 rounded-2xl cursor-pointer transition-all border",
                              currentTrip?.id === trip.id 
                                ? "bg-stone-950 text-white border-stone-950 shadow-lg" 
                                : "bg-white border-stone-100 hover:border-stone-300"
                            )}
                          >
                            <h3 className="font-bold text-sm leading-tight">{trip.destination}</h3>
                            <div className="flex items-center gap-3 mt-2 text-[10px] font-bold uppercase tracking-widest opacity-60">
                              <span className="flex items-center gap-1"><Calendar size={10} /> {trip.days} Days</span>
                              <span className="px-2 py-0.5 rounded bg-white/10">{trip.budget}</span>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Main Map/Itinerary View */}
              <div className="flex-1 relative flex flex-col bg-stone-50 overflow-hidden">
                {itinerary.length > 0 ? (
                  <div className="flex-1 flex flex-col h-full">
                    <div className="flex-1 min-h-[40%] relative">
                      <MapView itinerary={itinerary} />
                      <div className="absolute top-6 left-6 z-10 flex gap-2">
                        <div className="px-4 py-2 bg-white shadow-xl rounded-2xl border border-stone-100 text-xs font-bold text-stone-950 uppercase tracking-widest">
                          Map View
                        </div>
                      </div>
                    </div>

                    <div className="h-[55%] bg-white border-t border-stone-100 overflow-hidden flex flex-col shadow-2xl">
                      <div className="px-8 py-6 border-b border-stone-50 bg-white flex items-center justify-between shrink-0">
                        <div className="flex flex-col">
                          <h3 className="text-2xl font-bold text-stone-950 tracking-tighter italic">{currentTrip?.destination}</h3>
                          <div className="flex gap-6 mt-4">
                            {['itinerary', 'packing', 'notes'].map((tab) => (
                              <button
                                key={tab}
                                onClick={() => setActiveTab(tab as any)}
                                className={cn(
                                  "text-[10px] uppercase tracking-[0.2em] font-black py-1 transition-all border-b-2",
                                  activeTab === tab ? "text-stone-950 border-stone-950" : "text-stone-300 border-transparent hover:text-stone-500"
                                )}
                              >
                                {tab}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={handleExport}
                            className="px-6 py-2.5 rounded-full bg-stone-100 text-stone-600 text-xs font-bold hover:bg-stone-200 transition-all active:scale-95"
                          >
                            Export
                          </button>
                          <button 
                            onClick={handleShare}
                            className="px-6 py-2.5 rounded-full bg-stone-950 text-white text-xs font-bold hover:bg-stone-800 transition-all active:scale-95 shadow-lg shadow-stone-200"
                          >
                            Share
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex-1 overflow-x-auto p-8 custom-scrollbar bg-stone-50/20">
                        {activeTab === 'itinerary' && (
                          <div className="inline-flex gap-8 pb-4">
                            {itinerary.map((day) => (
                              <div key={day.dayNumber} className="w-80 shrink-0 flex flex-col gap-6">
                                <h4 className="text-stone-400 text-[10px] font-black tracking-[0.3em] uppercase ml-1">Day {day.dayNumber}</h4>
                                <div className="space-y-6">
                                  {day.activities.map((activity, idx) => (
                                    <motion.div 
                                      initial={{ opacity: 0, y: 10 }}
                                      animate={{ opacity: 1, y: 0 }}
                                      transition={{ delay: idx * 0.05 }}
                                      key={idx} 
                                      className="group p-6 bg-white rounded-[2rem] border border-stone-100 hover:border-stone-950 hover:shadow-2xl transition-all cursor-default shadow-sm relative overflow-hidden"
                                    >
                                      <div className="flex items-center justify-between mb-4">
                                        <span className="text-[10px] font-black text-stone-400 flex items-center gap-2 uppercase tracking-widest">
                                          <Clock size={12} className="text-stone-300" /> {activity.time}
                                        </span>
                                        <span className="text-[9px] font-black uppercase tracking-[0.1em] text-stone-400 px-3 py-1 bg-stone-50 border border-stone-100 rounded-full">
                                          {activity.category}
                                        </span>
                                      </div>
                                      <h5 className="font-bold text-stone-950 text-lg leading-tight mb-3 pr-4">{activity.title}</h5>
                                      <p className="text-xs text-stone-500 leading-relaxed font-medium">{activity.description}</p>
                                    </motion.div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {activeTab === 'packing' && (
                          <motion.div 
                            initial={{ opacity: 0, x: -20 }} 
                            animate={{ opacity: 1, x: 0 }}
                            className="max-w-md bg-white rounded-[2.5rem] border border-stone-100 p-10 shadow-xl"
                          >
                            <h4 className="text-lg font-bold text-stone-950 mb-8 flex items-center gap-3">
                              <CheckCircle2 size={24} className="text-stone-400" /> Checklist
                            </h4>
                            <div className="space-y-4">
                              {packingList.map((item, i) => (
                                <div key={i} className="flex items-center justify-between group">
                                  <div 
                                    className="flex items-center gap-4 cursor-pointer flex-1"
                                    onClick={() => handleTogglePacking(i)}
                                  >
                                    <div className={cn(
                                      "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                      item.checked ? "bg-stone-950 border-stone-950" : "border-stone-100"
                                    )}>
                                      {item.checked && <CheckCircle2 size={14} className="text-white" />}
                                    </div>
                                    <span className={cn("text-sm font-semibold transition-all", item.checked ? "text-stone-300 line-through" : "text-stone-700")}>
                                      {item.item}
                                    </span>
                                  </div>
                                  <button 
                                    onClick={() => handleRemovePacking(i)}
                                    className="opacity-0 group-hover:opacity-100 p-2 text-stone-200 hover:text-red-500 transition-all"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              ))}
                              <form 
                                className="mt-8 flex gap-3"
                                onSubmit={(e) => {
                                  e.preventDefault();
                                  const input = e.currentTarget.elements.namedItem('packItem') as HTMLInputElement;
                                  handleAddPacking(input.value);
                                  input.value = '';
                                }}
                              >
                                <input 
                                  name="packItem"
                                  type="text" 
                                  placeholder="What do you need?"
                                  className="flex-1 bg-stone-50 border border-stone-100 rounded-2xl px-5 py-3 text-sm font-medium outline-none focus:bg-white focus:border-stone-950 transition-all"
                                />
                                <button type="submit" className="w-12 h-12 rounded-2xl bg-stone-950 text-white flex items-center justify-center hover:scale-105 active:scale-95 transition-all">
                                  <Plus size={20} />
                                </button>
                              </form>
                            </div>
                          </motion.div>
                        )}

                        {activeTab === 'notes' && (
                          <motion.div 
                            initial={{ opacity: 0, x: -20 }} 
                            animate={{ opacity: 1, x: 0 }}
                            className="max-w-2xl bg-white rounded-[2.5rem] border border-stone-100 p-10 shadow-xl flex flex-col h-[450px]"
                          >
                            <h4 className="text-lg font-bold text-stone-950 mb-6 flex items-center gap-3">
                              <StickyNote size={24} className="text-stone-400" /> Trip Journal
                            </h4>
                            <textarea 
                              className="flex-1 w-full p-6 bg-stone-50 rounded-[2rem] text-sm text-stone-700 font-medium outline-none resize-none border border-transparent focus:bg-white focus:border-stone-100 transition-all leading-relaxed"
                              placeholder="Capturing moments, codes, or secrets..."
                              value={notes}
                              onChange={(e) => handleSaveNotes(e.target.value)}
                            />
                          </motion.div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 overflow-y-auto custom-scrollbar bg-white">
                    {/* Discovery Hero Section */}
                    <section className="relative h-[500px] flex items-center justify-center px-12">
                       <div className="absolute inset-0 z-0">
                          <img 
                            src="https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&q=80&w=2000" 
                            alt="Coastal"
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-stone-950/20 backdrop-blur-[1px]" />
                       </div>
                       
                       <div className="relative z-10 w-full max-w-4xl text-center">
                          <motion.h2 
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="text-6xl md:text-8xl font-black text-white tracking-tighter mb-12 italic drop-shadow-2xl"
                          >
                            Where to next?
                          </motion.h2>

                          {/* Search Bar Refined */}
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2 }}
                            className="bg-white p-4 rounded-[2.5rem] shadow-2xl border border-white/20 flex flex-col md:flex-row gap-4 max-w-3xl mx-auto"
                          >
                            <div className="flex-1 flex items-center gap-4 px-6 border-b md:border-b-0 md:border-r border-stone-100 py-2">
                               <Search className="text-stone-400" size={24} />
                               <input 
                                  type="text" 
                                  placeholder="Search destinations (e.g. Bali, Italy)"
                                  className="w-full text-lg font-bold text-stone-950 outline-none placeholder:text-stone-300"
                                  value={formData.destination}
                                  onChange={e => setFormData({ ...formData, destination: e.target.value })}
                                />
                            </div>
                            <button 
                              onClick={() => setShowForm(true)}
                              className="px-10 py-4 bg-stone-950 text-white rounded-full font-black text-lg hover:bg-stone-800 transition-all active:scale-95 shadow-xl shadow-stone-950/20 whitespace-nowrap"
                            >
                              Mapping
                            </button>
                          </motion.div>
                       </div>
                    </section>

                    <div className="p-12 md:p-24 max-w-7xl mx-auto space-y-32">
                      {/* Discovery Grid */}
                      <section>
                        <header className="mb-12 flex items-end justify-between px-2">
                          <div>
                            <span className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 block mb-3">Curated Escapes</span>
                            <h3 className="text-5xl font-bold tracking-tight text-stone-950">Inspired by the world.</h3>
                          </div>
                          <div className="flex gap-4">
                             <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center text-stone-400 cursor-not-allowed">
                                <ChevronRight size={20} className="rotate-180" />
                             </div>
                             <div className="w-12 h-12 bg-stone-950 rounded-full flex items-center justify-center text-white cursor-pointer hover:bg-stone-800 transition-colors">
                                <ChevronRight size={20} />
                             </div>
                          </div>
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                          {featuredDestinations.map((dest, i) => (
                            <motion.div 
                              key={i}
                              whileHover={{ y: -12 }}
                              className="group relative h-[500px] rounded-[3.5rem] overflow-hidden cursor-pointer shadow-2xl shadow-stone-200"
                              onClick={() => {
                                setFormData({ ...formData, destination: dest.title });
                                setShowForm(true);
                              }}
                            >
                              <img src={dest.img} alt={dest.title} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
                              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/20 to-transparent" />
                              <div className="absolute bottom-10 left-10 right-10">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50 mb-3 block">{dest.theme}</span>
                                <h3 className="text-3xl font-bold text-white tracking-tight">{dest.title}</h3>
                                <div className="mt-6 flex items-center gap-3 text-white/60 group-hover:text-white transition-colors">
                                  <span className="text-xs font-black uppercase tracking-widest">Start Journey</span>
                                  <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
                                    <ChevronRight size={16} />
                                  </div>
                                </div>
                              </div>
                              <div className="absolute top-8 right-8 p-4 bg-white/10 backdrop-blur-xl rounded-full border border-white/20 text-white hover:bg-white hover:text-stone-950 transition-all">
                                <Heart size={20} />
                              </div>
                            </motion.div>
                          ))}
                        </div>
                      </section>

                      {/* Call to Action Banner */}
                      <section className="relative p-16 md:p-24 bg-stone-950 rounded-[5rem] text-white overflow-hidden group">
                         <div className="absolute top-0 right-0 w-1/2 h-full opacity-30 group-hover:opacity-50 transition-opacity">
                            <img 
                              src="https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?auto=format&fit=crop&q=80&w=800" 
                              className="w-full h-full object-cover grayscale"
                              alt="Background"
                            />
                         </div>
                         
                         <div className="relative z-10 max-w-2xl">
                            <h3 className="text-5xl md:text-7xl font-bold mb-8 tracking-tighter italic">Personalized to your core.</h3>
                            <p className="text-stone-400 text-xl font-light leading-relaxed mb-12">
                              Voyager isn't just a planner. It uses Gemini's advanced reasoning to synthesize your mood, budget, and curiosity into a seamless global path.
                            </p>
                            <button 
                              onClick={() => setShowForm(true)}
                              className="px-12 py-5 bg-white text-stone-950 rounded-full font-black text-xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
                            >
                              Explore the Unseen
                            </button>
                         </div>
                      </section>
                    </div>

                    <footer className="py-20 border-t border-stone-100 px-12 bg-white">
                       <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
                          <div className="flex items-center gap-2">
                             <Navigation size={24} className="text-stone-950" />
                             <span className="text-xl font-bold italic tracking-tighter">Voyager</span>
                          </div>
                          <p className="text-stone-400 text-sm font-medium uppercase tracking-[0.2em]">© 2026 AI JOURNEY LABS</p>
                          <div className="flex gap-8 text-stone-400 text-xs font-bold uppercase tracking-widest">
                             <a href="#" className="hover:text-stone-950 transition-colors">Privacy</a>
                             <a href="#" className="hover:text-stone-950 transition-colors">Safety</a>
                             <a href="#" className="hover:text-stone-950 transition-colors">Contact</a>
                          </div>
                       </div>
                    </footer>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* History View Replaced with Full Page Grid */}
          {activeView === 'history' && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="flex-1 p-12 md:p-24 max-w-7xl mx-auto w-full h-full overflow-y-auto custom-scrollbar bg-white"
            >
              <div className="flex items-end justify-between mb-20">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 block mb-3">Your Archive</span>
                  <h2 className="text-6xl font-bold tracking-tight text-stone-950">Memory Vault.</h2>
                </div>
                <button 
                  onClick={() => { setActiveView('planner'); setShowForm(true); }}
                  className="px-8 py-4 bg-stone-100 text-stone-950 rounded-full font-black hover:bg-stone-950 hover:text-white transition-all active:scale-95 flex items-center gap-3"
                >
                  <Plus size={20} /> New Memory
                </button>
              </div>

              {savedTrips.length === 0 ? (
                <div className="text-center py-48 rounded-[4rem] border-4 border-dashed border-stone-50">
                  <Clock size={48} className="mx-auto text-stone-200 mb-8" />
                  <p className="text-stone-400 font-bold uppercase tracking-widest">No journeys recorded yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                  {savedTrips.map((trip: any) => (
                    <motion.div 
                      key={trip.id}
                      whileHover={{ y: -8 }}
                      onClick={() => loadTrip(trip)}
                      className="p-10 bg-white rounded-[3rem] border border-stone-100 cursor-pointer shadow-xl hover:shadow-[0_40px_80px_rgba(0,0,0,0.05)] hover:border-stone-950 transition-all group overflow-hidden relative"
                    >
                      <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                         <MapIcon size={120} className="text-stone-950" />
                      </div>
                      <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center text-stone-300 mb-8 group-hover:bg-stone-950 group-hover:text-white transition-all">
                        <MapIcon size={28} />
                      </div>
                      <h3 className="text-3xl font-bold text-stone-950 mb-3 tracking-tighter italic">{trip.destination}</h3>
                      <div className="flex items-center gap-6 text-[10px] font-black uppercase tracking-widest text-stone-400">
                        <span className="flex items-center gap-2"><Calendar size={14} /> {trip.days} Days</span>
                        <span className="px-3 py-1 bg-stone-50 rounded-full text-stone-600 border border-stone-100">{trip.budget}</span>
                      </div>
                      <div className="mt-12 flex justify-between items-center">
                        <span className="text-[10px] font-bold text-stone-300 tracking-widest">VIEW ITINERARY</span>
                        <div className="w-10 h-10 rounded-full bg-stone-50 flex items-center justify-center text-stone-400 group-hover:translate-x-2 transition-transform">
                          <ChevronRight size={20} />
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Settings View */}
          {activeView === 'settings' && (
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }}
              className="flex-1 p-12 md:p-24 max-w-4xl mx-auto w-full h-full overflow-y-auto"
            >
              <div className="mb-20">
                <span className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 block mb-3">Identity</span>
                <h2 className="text-6xl font-bold tracking-tight text-stone-950">Settings.</h2>
              </div>

              <div className="space-y-12">
                <div className="p-10 bg-white rounded-[3.5rem] border border-stone-100 shadow-2xl shadow-stone-200/50">
                  <div className="flex items-center gap-10 mb-12">
                    <div className="w-28 h-28 rounded-full bg-stone-100 flex items-center justify-center text-stone-300 overflow-hidden border-4 border-white shadow-xl">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <Compass size={40} />
                      )}
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold text-stone-950 tracking-tight italic">{user.displayName || 'Traveler'}</h3>
                      <p className="text-stone-400 text-lg font-medium">{user.email}</p>
                    </div>
                  </div>

                  <div className="space-y-8 pt-10 border-t border-stone-50">
                    <div className="flex items-center justify-between group">
                      <div>
                        <p className="font-bold text-stone-950 tracking-tight">Real-time Sync</p>
                        <p className="text-xs text-stone-400 font-medium">Auto-save plans as you map them</p>
                      </div>
                      <div className="w-14 h-7 bg-stone-950 rounded-full cursor-pointer relative shadow-inner">
                        <div className="absolute top-1 right-1 w-5 h-5 bg-white rounded-full shadow-sm" />
                      </div>
                    </div>
                      <div className="flex items-center justify-between group">
                         <div>
                          <p className="font-bold text-stone-950 tracking-tight">Units & Metrics</p>
                          <p className="text-xs text-stone-400 font-medium">Distances and currency formats</p>
                        </div>
                        <button 
                          onClick={() => setUnitSystem(unitSystem === 'metric' ? 'imperial' : 'metric')}
                          className="px-6 py-2 bg-stone-50 border border-stone-100 rounded-full text-xs font-black text-stone-950 uppercase tracking-widest hover:bg-stone-950 hover:text-white transition-all capitalize"
                        >
                          {unitSystem}
                        </button>
                      </div>
                    <div className="flex items-center justify-between group">
                       <div>
                        <p className="font-bold text-stone-950 tracking-tight">Security Archive</p>
                        <p className="text-xs text-stone-400 font-medium">Wipe your travel history and tokens</p>
                      </div>
                      <button className="text-xs font-black text-red-500 uppercase tracking-widest hover:underline underline-offset-8 decoration-2">Clear Records</button>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={logout}
                  className="w-full py-6 bg-red-50 border border-red-100 text-red-600 rounded-[2rem] font-black text-lg hover:bg-red-600 hover:text-white transition-all flex items-center justify-center gap-3 shadow-xl shadow-red-100/50"
                >
                  <LogOut size={24} /> End Session
                </button>
              </div>
            </motion.div>
          )}

          {/* Modal Overlay for Generation / Forms */}
          <AnimatePresence>
            {showForm && (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[100] flex items-center justify-center p-6"
              >
                <div className="absolute inset-0 bg-stone-950/80 backdrop-blur-xl" onClick={() => setShowForm(false)} />
                <motion.div 
                   initial={{ scale: 0.9, opacity: 0, y: 30 }}
                   animate={{ scale: 1, opacity: 1, y: 0 }}
                   exit={{ scale: 0.9, opacity: 0, y: 30 }}
                   className="relative w-full max-w-xl bg-white rounded-[4rem] p-12 shadow-[0_40px_100px_rgba(0,0,0,0.5)] overflow-hidden"
                >
                   {/* Gradient Accent */}
                   <div className="absolute top-0 left-0 w-full h-3 bg-gradient-to-r from-cyan-400 via-orange-400 to-purple-400" />
                   
                   <div className="flex justify-between items-start mb-12">
                      <div>
                         <h3 className="text-4xl font-bold text-stone-950 tracking-tighter mb-2 italic">Map a new path.</h3>
                         <p className="text-stone-400 text-sm font-medium">Input your constraints, let the AI reason.</p>
                      </div>
                      <button 
                        onClick={() => setShowForm(false)} 
                        className="w-12 h-12 bg-stone-50 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-950 hover:text-white transition-all"
                      >
                        <Plus size={24} className="rotate-45" />
                      </button>
                   </div>

                   <form onSubmit={handleGenerate} className="space-y-8">
                      {errorMessage && (
                        <div className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-3 text-red-600 text-sm font-medium">
                          <AlertCircle size={18} />
                          {errorMessage}
                        </div>
                      )}
                      <div className="space-y-4">
                        <label className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 ml-1">Destination</label>
                        <div className="relative group">
                          <Search className="absolute left-6 top-5 text-stone-300 group-focus-within:text-stone-950 transition-colors" size={20} />
                          <input 
                            type="text" 
                            required
                            className="w-full bg-stone-50 border-2 border-stone-50 rounded-3xl pl-16 pr-6 py-5 text-lg font-bold text-stone-950 outline-none focus:border-stone-950 focus:bg-white transition-all"
                            placeholder="Paris, France"
                            value={formData.destination}
                            onChange={e => setFormData({ ...formData, destination: e.target.value })}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-8">
                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 ml-1">Duration (Days)</label>
                          <input 
                            type="number" 
                            min={1} max={14}
                            className="w-full bg-stone-50 border-2 border-stone-50 rounded-3xl px-8 py-5 text-lg font-bold text-stone-950 outline-none focus:border-stone-950 focus:bg-white transition-all"
                            value={formData.days}
                            onChange={e => setFormData({ ...formData, days: parseInt(e.target.value) })}
                          />
                        </div>
                        <div className="space-y-4">
                          <label className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-300 ml-1">Budget Tier</label>
                          <select 
                            className="w-full bg-stone-50 border-2 border-stone-50 rounded-3xl px-8 py-5 text-lg font-bold text-stone-950 outline-none focus:border-stone-950 focus:bg-white transition-all appearance-none"
                            value={formData.budget}
                            onChange={e => setFormData({...formData, budget: e.target.value })}
                          >
                            <option value="budget">Economic</option>
                            <option value="moderate">Balanced</option>
                            <option value="luxury">Premier</option>
                          </select>
                        </div>
                      </div>

                      <div className="pt-6">
                        <button 
                          type="submit"
                          disabled={isGenerating}
                          className="w-full py-6 bg-stone-950 text-white rounded-[2rem] font-black text-xl flex items-center justify-center gap-3 disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-stone-950/20"
                        >
                          {isGenerating ? <Loader2 className="animate-spin" size={24} /> : <PlaneTakeoff size={24} />}
                          {isGenerating ? 'Synthesizing Path...' : 'Create Itinerary'}
                        </button>
                      </div>
                   </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #d1d1d1; }
      `}</style>
    </APIProvider>
  );
}
