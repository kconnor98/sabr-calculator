import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Circle, CheckCircle, XCircle, ArrowRight, Lightbulb, X, Printer, Edit, Plus, Trash2, Play, Pause, RefreshCw } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, onSnapshot, collection, serverTimestamp } from 'firebase/firestore';

// --- Shared Data and Utility Functions ---
const ptvData = [
  { ptv: 1.8, r50p: 5.9, r50v: 7.5, d2cmp: 50.0, d2cmv: 57.0 },
  { ptv: 3.8, r50p: 5.5, r50v: 6.5, d2cmp: 50.0, d2cmv: 57.0 },
  { ptv: 7.4, r50p: 5.1, r50v: 6.0, d2cmp: 50.0, d2cmv: 58.0 },
  { ptv: 13.2, r50p: 4.7, r50v: 5.8, d2cmp: 50.0, d2cmv: 58.0 },
  { ptv: 22.0, r50p: 4.5, r50v: 5.5, d2cmp: 54.0, d2cmv: 63.0 },
  { ptv: 34.0, r50p: 4.3, r50v: 5.3, d2cmp: 58.0, d2cmv: 68.0 },
  { ptv: 50.0, r50p: 4.0, r50v: 5.0, d2cmp: 62.0, d2cmv: 77.0 },
  { ptv: 70.0, r50p: 3.5, r50v: 4.8, d2cmp: 66.0, d2cmv: 86.0 },
  { ptv: 95.0, r50p: 3.3, r50v: 4.4, d2cmp: 70.0, d2cmv: 89.0 },
  { ptv: 126.0, r50p: 3.1, r50v: 4.0, d2cmp: 73.0, d2cmv: 91.0 },
  { ptv: 163.0, r50p: 2.9, r50v: 3.7, d2cmp: 77.0, d2cmv: 94.0 },
];

const glossaryTerms = [
  { term: 'SABR', definition: 'Stereotactic Ablative Body Radiotherapy, a specialized form of external beam radiation therapy using high doses over a few fractions.' },
  { term: 'SBRT', definition: 'Stereotactic Body Radiation Therapy, an alternative name for SABR.' },
  { term: 'PTV', definition: 'Planning Target Volume, the clinical target volume plus a margin to account for setup uncertainties and motion.' },
  { term: 'CI50', definition: 'A conformity index, typically the ratio of the volume receiving 50% of the prescription dose to the PTV volume. Lower values indicate better conformality.' },
  { term: 'CI100', definition: 'A conformity index, the ratio of the volume receiving 100% of the prescription dose to the PTV volume. Values close to 1 are ideal.' },
  { term: 'R50%', definition: 'A conformity index used in RTOG protocols. It is the ratio of the volume encompassed by the 50% isodose line to the PTV volume. A lower value signifies better dose fall-off.' },
  { term: 'D2cm', definition: 'The maximum dose to any point 2 cm away from the PTV. A metric to evaluate dose spillage and organ-at-risk sparing.' },
  { term: 'MU', definition: 'Monitor Units, a unit of measure for the amount of radiation delivered by a linear accelerator.' },
  { term: 'V100', definition: 'Volume receiving 100% of the prescribed dose. Used in the calculation of CI100.' },
  { term: 'V50', definition: 'Volume receiving 50% of the prescribed dose. Used in the calculation of CI50.' },
  { term: 'V105', definition: 'Volume receiving 105% of the prescribed dose. Used to assess dose spillage.' },
];

// Linear interpolation function
const interpolate = (x, x1, y1, x2, y2) => {
    if (x1 === x2) return y1;
    return y1 + (x - x1) * (y2 - y1) / (x2 - x1);
};

// --- Reusable Components (Rendered from a separate file in a real project) ---
const NavLink = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`page-link text-sm md:text-lg font-medium px-2 md:px-4 py-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? 'bg-blue-600 hover:bg-blue-700 active' : 'bg-gray-700 hover:bg-gray-600'}`}
  >
    {label}
  </button>
);

const InputField = ({ label, value, onChange, ...props }) => (
  <div className="flex flex-col space-y-1">
    <label className="block text-md font-medium text-gray-300 mb-2">{label}</label>
    <input
      type="number"
      value={value}
      onChange={onChange}
      className="w-full px-4 py-3 bg-gray-800 text-cyan-400 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg transition duration-200"
      placeholder={`e.g., ${label.includes('PTV') ? '85' : '60'}`}
      {...props}
    />
  </div>
);

const OutputCard = ({ label, value, colour, simple, feedback }) => {
  const bgColor = {
    blue: 'bg-blue-900/20', teal: 'bg-teal-900/20', green: 'bg-green-900/20', cyan: 'bg-cyan-900/20',
    purple: 'bg-purple-900/20', indigo: 'bg-indigo-900/20', pink: 'bg-pink-900/20'
  }[colour];
  const borderColor = {
    blue: 'border-blue-900', teal: 'border-teal-900', green: 'border-green-900', cyan: 'border-cyan-900',
    purple: 'border-purple-900', indigo: 'border-indigo-900', pink: 'border-pink-900'
  }[colour];
  const textColor = {
    blue: 'text-blue-400', teal: 'text-teal-400', green: 'text-green-400', cyan: 'text-cyan-400',
    purple: 'text-purple-400', indigo: 'text-indigo-400', pink: 'text-pink-400'
  }[colour];
  const labelColour = {
    blue: 'text-blue-300', teal: 'text-teal-300', green: 'text-green-300', cyan: 'text-cyan-300',
    purple: 'text-purple-300', indigo: 'text-indigo-300', pink: 'text-pink-300'
  }[colour];

  return (
    <div className={`${bgColor} rounded-xl p-6 shadow-md border ${borderColor} transition-transform transform hover:scale-105 duration-200`}>
      <h3 className={`text-md ${labelColour} font-semibold mb-2 text-center`}>{label}</h3>
      <p className={`text-2xl md:text-3xl font-bold ${textColor} text-center`}>{value}</p>
      {feedback && feedback !== '-' && (
        <div className="text-center mt-2 text-sm font-semibold text-gray-400">
          ({feedback})
        </div>
      )}
    </div>
  );
};

const StatusText = ({ status, label }) => {
  const getStatusContent = () => {
    switch(status) {
      case 'pass': return <><CheckCircle size={18} className="mr-2" /> Pass</>;
      case 'acceptable': return <><Circle size={18} className="mr-2" /> Acceptable</>;
      case 'fail': return <><XCircle size={18} className="mr-2" /> Fail</>;
      default: return '-';
    }
  };
  const getStatusColour = () => {
    switch(status) {
      case 'pass': return 'text-green-400';
      case 'acceptable': return 'text-yellow-400';
      case 'fail': return 'text-red-400';
      default: return 'text-gray-500';
    }
  };
  return (
    <div className={`mt-2 text-md font-bold flex items-center justify-center ${getStatusColour()}`}>
      {getStatusContent()}
    </div>
  );
};

const StatusCard = ({ label, value, status }) => {
  const getCardColour = () => {
    switch(label) {
      case 'CI100': return 'bg-purple-900/20 border-purple-900';
      case 'CI50': return 'bg-indigo-900/20 border-indigo-900';
      default: return 'bg-gray-800 border-gray-700';
    }
  };
  return (
    <div className={`${getCardColour()} rounded-xl p-6 shadow-md border transition-transform transform hover:scale-105 duration-200`}>
      <h3 className="text-md text-gray-300 font-semibold mb-2 text-center">{label}</h3>
      <p className="text-2xl md:text-3xl font-bold text-cyan-400 text-center">{value}</p>
      <StatusText status={status} label={label} />
    </div>
  );
};

const Ci50Graph = ({ ci50Value, ranges }) => {
  const graphMax = 8;
  const getCi50Colour = (value) => {
    if (isNaN(value)) return 'bg-gray-500';
    if (value <= ranges.perProtocol.max) return 'bg-green-500';
    if (value <= ranges.acceptable.max) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getCi50Label = (value) => {
    if (isNaN(value)) return 'N/A';
    if (value <= ranges.perProtocol.max) return 'Per-Protocol';
    if (value <= ranges.acceptable.max) return 'Acceptable';
    return 'Unacceptable';
  };

  const markerPosition = Math.min(Math.max(ci50Value, 0), graphMax);

  return (
    <div className="flex flex-col items-center justify-center p-6 bg-gray-800 rounded-xl shadow-inner">
      <div className="w-full max-w-xl">
        <div className="relative h-12">
          {/* Unacceptable Range */}
          <div
            className="absolute top-0 bottom-0 rounded-r-full bg-red-600 transition-all duration-500 ease-in-out"
            style={{
              left: `${(ranges.acceptable.max / graphMax) * 100}%`,
              right: `0%`
            }}
          ></div>
          {/* Acceptable Range */}
          <div
            className="absolute top-0 bottom-0 rounded-full bg-yellow-600 transition-all duration-500 ease-in-out"
            style={{
              left: `${(ranges.perProtocol.max / graphMax) * 100}%`,
              right: `${100 - (ranges.acceptable.max / graphMax) * 100}%`
            }}
          ></div>
          {/* Per-Protocol Range */}
          <div
            className="absolute top-0 bottom-0 rounded-l-full bg-green-600 transition-all duration-500 ease-in-out"
            style={{
              left: `0%`,
              right: `${100 - (ranges.perProtocol.max / graphMax) * 100}%`
            }}
          ></div>

          {/* CI50 Value Marker */}
          {!isNaN(ci50Value) && (
            <div
              className={`absolute top-0 bottom-0 w-1 shadow-lg transform transition-all duration-500 ease-in-out ${getCi50Colour(ci50Value)}`}
              style={{
                left: `${(markerPosition / graphMax) * 100}%`
              }}
            >
              <div className="absolute -top-12 -left-8 w-20 text-center text-sm font-semibold">
                <span className="text-sm font-bold text-gray-100">CI50: {ci50Value.toFixed(2)}</span>
                <p className={`text-xs mt-1 ${getCi50Colour(ci50Value)}`}>{getCi50Label(ci50Value)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Labels */}
        <div className="mt-4 flex justify-between text-sm font-semibold text-gray-400">
          {[...Array(9).keys()].map(i => (
              <span key={i}>{i}.0</span>
          ))}
        </div>
        <div className="mt-2 text-center text-xs text-gray-500">
            (Ranges are dynamically calculated based on the entered PTV volume)
        </div>
      </div>
    </div>
  );
};

// Suggestions Modal component
const SuggestionsModal = ({ show, onClose, onSend, suggestionText, onTextChange, isSubmitting, status }) => {
    if (!show) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl p-6 md:p-8 w-full max-w-md shadow-2xl border border-gray-700 relative">
                <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-gray-100 transition duration-200">
                    <X size={24} />
                </button>
                <h2 className="text-2xl font-bold text-cyan-400 mb-4 text-center">Suggest an Edit</h2>
                <p className="text-gray-400 mb-4 text-center">
                    Have an idea for an improvement? Let me know!
                </p>
                <textarea
                    className="w-full h-32 p-4 bg-gray-900 text-gray-100 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200 resize-none"
                    placeholder="E.g., 'Please add an option to save the results.'"
                    value={suggestionText}
                    onChange={onTextChange}
                />
                <button
                    onClick={onSend}
                    className={`w-full py-3 mt-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center ${
                      isSubmitting
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
                    }`}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Sending...
                      </>
                    ) : 'Send Suggestion'}
                </button>
                {status === 'success' && (
                    <div className="mt-4 p-4 rounded-lg bg-green-900/20 text-green-400 text-center">
                        <p className="font-semibold mb-2">Thank you! Your suggestion has been submitted.</p>
                    </div>
                )}
                {status === 'error' && (
                    <div className="mt-4 p-4 rounded-lg bg-red-900/20 text-red-400 text-center">
                        <p className="font-semibold mb-2">Oops! Something went wrong.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Interplay Effect Animation Component ---
const InterplayEffectAnimation = () => {
    const canvasRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(true);
    const [showIdealDose, setShowIdealDose] = useState(false);
    const animationState = useRef({
        beamX: 0,
        time: 0,
        dosePoints: []
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        let animationFrameId;

        const resetAnimation = () => {
            animationState.current = {
                beamX: 0,
                time: 0,
                dosePoints: []
            };
        };
        
        const render = () => {
            const width = canvas.width;
            const height = canvas.height;
            const targetRadius = 30;
            const beamWidth = 20;
            const beamHeight = height;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Update state if playing
            if (isPlaying) {
                animationState.current.time += 0.02;
                animationState.current.beamX += 1;
                if (animationState.current.beamX > width) {
                    animationState.current.beamX = 0;
                    animationState.current.dosePoints = [];
                }
            }
            
            const { beamX, time, dosePoints } = animationState.current;
            
            // Calculate target position (sinusoidal motion)
            const targetY = height / 2 + Math.sin(time * 2) * (height / 4);
            const targetX = width / 2;

            // Draw Ideal Dose if toggled
            if (showIdealDose) {
                ctx.fillStyle = 'rgba(74, 222, 128, 0.5)'; // green-400 with opacity
                ctx.beginPath();
                ctx.arc(targetX, height / 2, targetRadius, 0, 2 * Math.PI);
                ctx.fill();
                ctx.strokeStyle = '#4ade80'; // green-400
                ctx.lineWidth = 2;
                ctx.stroke();
            } else {
                // Draw Actual Dose points
                ctx.fillStyle = 'rgba(250, 204, 21, 0.7)'; // yellow-400 with opacity
                dosePoints.forEach(p => {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 2, 0, 2 * Math.PI);
                    ctx.fill();
                });
            }

            // Draw the moving beam
            ctx.fillStyle = 'rgba(96, 165, 250, 0.3)'; // blue-400 with opacity
            ctx.fillRect(beamX - beamWidth / 2, 0, beamWidth, beamHeight);

            // Draw the moving target
            ctx.strokeStyle = '#f87171'; // red-400
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(targetX, targetY, targetRadius, 0, 2 * Math.PI);
            ctx.stroke();
            ctx.fillStyle = 'rgba(239, 68, 68, 0.2)'; // red-500 with opacity
            ctx.fill();

            // Add new dose point if beam intersects target
            const distance = Math.sqrt(Math.pow(beamX - targetX, 2));
            if (isPlaying && distance < targetRadius + beamWidth / 2) {
                // Add multiple points to simulate dose deposition
                for(let i = 0; i < 5; i++) {
                    const randY = targetY + (Math.random() - 0.5) * targetRadius * 1.5;
                    const randX = beamX + (Math.random() - 0.5) * beamWidth;
                     if (Math.sqrt(Math.pow(randX - targetX, 2) + Math.pow(randY - targetY, 2)) < targetRadius) {
                        dosePoints.push({ x: randX, y: randY });
                     }
                }
            }
            
            animationFrameId = window.requestAnimationFrame(render);
        };
        
        render();
        
        return () => {
            window.cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, showIdealDose]);

    const handleReset = () => {
        setIsPlaying(false);
        animationState.current = { beamX: 0, time: 0, dosePoints: [] };
        setTimeout(() => setIsPlaying(true), 100);
    };

    return (
        <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 mt-8">
            <h4 className="text-xl font-bold text-center text-blue-400 mb-4">Visualizing the Interplay Effect</h4>
            <div className="relative w-full" style={{paddingBottom: '50%'}}>
                 <canvas ref={canvasRef} width="600" height="300" className="absolute top-0 left-0 w-full h-full bg-gray-900 rounded-lg border border-gray-600"></canvas>
            </div>
            <div className="flex flex-wrap justify-center items-center gap-4 mt-4">
                <button onClick={() => setIsPlaying(!isPlaying)} className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 transition duration-200">
                    {isPlaying ? <Pause size={18} className="mr-2" /> : <Play size={18} className="mr-2" />}
                    {isPlaying ? 'Pause' : 'Play'}
                </button>
                <button onClick={handleReset} className="flex items-center px-4 py-2 bg-gray-600 text-white rounded-lg font-semibold shadow-md hover:bg-gray-700 transition duration-200">
                    <RefreshCw size={18} className="mr-2" />
                    Reset
                </button>
                <div className="flex items-center">
                    <input 
                        type="checkbox" 
                        id="idealDoseToggle"
                        checked={showIdealDose}
                        onChange={() => setShowIdealDose(!showIdealDose)}
                        className="form-checkbox h-5 w-5 text-green-500 rounded focus:ring-green-500 transition duration-150 ease-in-out bg-gray-900 border-gray-600 cursor-pointer"
                    />
                    <label htmlFor="idealDoseToggle" className="ml-2 text-gray-300 font-semibold cursor-pointer">
                        Show Ideal Dose
                    </label>
                </div>
            </div>
            <div className="flex justify-around mt-4 text-sm text-gray-400">
                <div className="flex items-center"><div className="w-3 h-3 rounded-full border-2 border-red-400 mr-2"></div>Moving Target</div>
                <div className="flex items-center"><div className="w-3 h-3 bg-blue-400/50 mr-2"></div>Radiation Beam</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-yellow-400/70 mr-2"></div>Actual Dose</div>
                <div className="flex items-center"><div className="w-3 h-3 rounded-full bg-green-400/50 mr-2"></div>Ideal Dose</div>
            </div>
        </div>
    );
};


// --- Page-specific Components (Rendered from a separate file in a real project) ---
const RTOGCalculator = ({ inputs, onInputChange, useInstitutionalData, onToggleUseInstitutional, outputs, status, table }) => (
  <div className="print-area">
    <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-2">SABR Conformity Index Calculator</h1>
        <p className="text-gray-400 text-lg">Calculate R50% and D2cm values based on RTOG 0815 Guidelines for Dose Spillage and Conformality for Lung Targets</p>
    </div>
    <div className="no-print flex items-center justify-center mb-6">
        <label className="flex items-center text-gray-300 cursor-pointer">
            <input
                type="checkbox"
                checked={useInstitutionalData}
                onChange={onToggleUseInstitutional}
                className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500 transition duration-150 ease-in-out bg-gray-900 border-gray-600"
            />
            <span className="ml-2 font-semibold">Use My Institutional Data</span>
        </label>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 no-print">
      <InputField label="Enter PTV Volume (cc)" value={inputs.ptvVolume} onChange={e => onInputChange('ptvVolume', e.target.value)} type="number" min="1.8" max="163" step="0.1" />
      <InputField label="Enter Dose per Fraction (Gy)" value={inputs.prescriptionDose} onChange={e => onInputChange('prescriptionDose', e.target.value)} type="number" step="0.1" />
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <OutputCard label="R50% Per Protocol" value={outputs.r50p} colour="blue" />
      <OutputCard label="R50% Acceptable Variation" value={outputs.r50v} colour="teal" />
      <OutputCard label="D2cm[%] Per Protocol" value={outputs.d2cmp} colour="green" />
      <OutputCard label="D2cm[%] Acceptable Variation" value={outputs.d2cmv} colour="cyan" />
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div className="bg-purple-900/20 rounded-2xl p-6 shadow-lg border-2 border-purple-600 col-span-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OutputCard label="Scorecard CI50" value={outputs.scorecardCI50} colour="purple" simple />
          <OutputCard label="50% of Prescription Dose (Gy)" value={outputs.dose50Percent} colour="purple" simple />
        </div>
      </div>
      <div className="bg-indigo-900/20 rounded-2xl p-6 shadow-lg border-2 border-indigo-600 col-span-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <OutputCard label="15% PTV Vol (cc)" value={outputs.ptv15Percent} colour="indigo" simple />
          <OutputCard label="105% of Prescription Dose (Gy)" value={outputs.dose105Percent} colour="indigo" simple />
        </div>
      </div>
      <div className="bg-pink-900/20 rounded-2xl p-6 shadow-lg border-2 border-pink-600 col-span-1">
        <h3 className="text-md text-pink-300 font-semibold mb-2 text-center">Scorecard Body-(PTV+2cm) (Gy)</h3>
        <p className="text-2xl md:text-3xl font-bold text-pink-400 text-center">{outputs.scorecardBody}</p>
      </div>
    </div>
    {status && <div className="mt-8 text-center text-md md:text-lg font-medium text-red-500">{status}</div>}
    <div className="mt-12 no-print">
      <h2 className="text-2xl md:text-3xl font-bold text-cyan-400 mb-4 text-center">
        {useInstitutionalData ? 'My Institutional Data' : 'RTOG 0815 Data Table'}
      </h2>
      <div className="table-responsive">
        <table className="table-auto w-full text-left rounded-lg overflow-hidden border border-gray-700">
          <thead className="bg-gray-800">
            <tr>
              <th className="px-4 py-3 border-r border-gray-700 text-sm md:text-base font-semibold text-gray-300">PTV Volume (cc)</th>
              <th className="px-4 py-3 border-r border-gray-700 text-sm md:text-base font-semibold text-gray-300">R50% Per Protocol</th>
              <th className="px-4 py-3 border-r border-gray-700 text-sm md:text-base font-semibold text-gray-300">R50% Acceptable Variation</th>
              <th className="px-4 py-3 border-r border-gray-700 text-sm md:text-base font-semibold text-gray-300">D2cm[%] Per Protocol</th>
              <th className="px-4 py-3 text-sm md:text-base font-semibold text-gray-300">D2cm[%] Acceptable Variation</th>
            </tr>
          </thead>
          <tbody className="bg-gray-900 divide-y divide-gray-800">
            {table.map((row, index) => (
              <tr key={index} className={`hover:bg-gray-800 transition duration-150 ${row.interpolated ? 'bg-blue-900/30' : ''}`}>
                <td className="px-4 py-2 border-r border-gray-800">{row.ptv}</td>
                <td className="px-4 py-2 border-r border-gray-800">{row.r50p}</td>
                <td className="px-4 py-2 border-r border-gray-800">{row.r50v}</td>
                <td className="px-4 py-2 border-r border-gray-800">{row.d2cmp}</td>
                <td className="px-4 py-2">{row.d2cmv}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </div>
);

const AdvancedMetrics = ({ inputs, onInputChange, outputs, status, ci50Value, ci50GraphRanges, useInstitutionalData, onToggleUseInstitutional }) => (
  <div className="print-area">
    <div className="no-print">
      <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-2">Plan Metric Analysis</h1>
          <p className="text-gray-400 text-lg">Calculate key conformity indices, MU/Gy ratio, and estimate treatment time.</p>
      </div>
      <div className="p-6 md:p-8 bg-gray-800 rounded-xl mb-8 border border-gray-700 shadow-lg">
          <h2 className="text-xl md:text-2xl font-bold text-blue-400 mb-4">Calculate Conformity & Spillage</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
              <InputField label="PTV Volume (cc)" value={inputs.ptvVolume} onChange={e => onInputChange('ptvVolume', e.target.value)} type="number" step="0.1" />
              <InputField label="V100% Volume (cc)" value={inputs.v100} onChange={e => onInputChange('v100', e.target.value)} type="number" step="0.1" />
              <InputField label="V50% Volume (cc)" value={inputs.v50} onChange={e => onInputChange('v50', e.target.value)} type="number" step="0.1" />
              <InputField label="V105% Volume (cc)" value={inputs.v105} onChange={e => onInputChange('v105', e.target.value)} type="number" step="0.1" />
          </div>
      </div>
    </div>
    <div className="no-print flex items-center justify-center mb-6">
        <label className="flex items-center text-gray-300 cursor-pointer">
            <input
                type="checkbox"
                checked={useInstitutionalData}
                onChange={onToggleUseInstitutional}
                className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500 transition duration-150 ease-in-out bg-gray-900 border-gray-600"
            />
            <span className="ml-2 font-semibold">Use My Institutional Data</span>
        </label>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatusCard label="CI100" value={outputs.ci100} status={outputs.ci100Status} />
      <StatusCard label="CI50" value={outputs.ci50} status={outputs.ci50Status} />
      <div className="bg-green-900/20 rounded-xl p-6 shadow-md border border-green-900 transition-transform transform hover:scale-105 duration-200">
        <h3 className="text-md text-green-300 font-semibold mb-2 text-center">105% Spillage Check</h3>
        <div className="flex justify-between items-center mt-2 mb-2">
            <span className="text-sm md:text-base">105% Spillage Volume (cc):</span>
            <span className="font-bold text-green-400">{outputs.spillageVolume}</span>
        </div>
        <div className="flex justify-between items-center mb-2">
            <span className="text-sm md:text-base">15% PTV Volume (cc):</span>
            <span className="font-bold text-green-400">{outputs.ptv15Tolerance}</span>
        </div>
        <StatusText status={outputs.spillageStatus} label="Spillage" />
      </div>
    </div>
    <div className="no-print border-t border-gray-700 pt-8 mt-8">
      <h2 className="text-2xl font-bold text-center text-cyan-400 mb-6">RTOG Protocol CI50 Ranges</h2>
      <Ci50Graph ci50Value={ci50Value} ranges={ci50GraphRanges} />
    </div>
    <div className="no-print p-6 md:p-8 bg-gray-800 rounded-xl mt-8 mb-8 border border-gray-700 shadow-lg">
        <h2 className="text-xl md:text-2xl font-bold text-blue-400 mb-4">Calculate MU/Gy & Treatment Time</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <InputField label="Total Plan MUs" value={inputs.totalMUs} onChange={e => onInputChange('totalMUs', e.target.value)} type="number" step="1" />
            <InputField label="Dose per Fraction (Gy)" value={inputs.dosePerFraction} onChange={e => onInputChange('dosePerFraction', e.target.value)} type="number" step="0.1" />
            <InputField label="Max Dose Rate (MU/min)" value={inputs.doseRate} onChange={e => onInputChange('doseRate', e.target.value)} type="number" step="1" />
        </div>
        <div className="flex items-center mt-6 p-4 bg-gray-700 rounded-lg">
            <input
                type="checkbox"
                id="breathHold"
                checked={inputs.breathHoldEnabled}
                onChange={e => onInputChange('breathHoldEnabled', e.target.checked)}
                className="form-checkbox h-5 w-5 text-blue-600 rounded focus:ring-blue-500 transition duration-150 ease-in-out bg-gray-900 border-gray-600 cursor-pointer"
            />
            <label htmlFor="breathHold" className="ml-2 text-gray-300 font-semibold cursor-pointer">
                Enable Breath-Hold Calculation
            </label>
        </div>
        {inputs.breathHoldEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <InputField
                    label="Hold Time (seconds)"
                    value={inputs.holdTime}
                    onChange={e => onInputChange('holdTime', e.target.value)}
                    type="number" step="1" min="1"
                />
                <InputField
                    label="Recovery Time (seconds)"
                    value={inputs.recoveryTime}
                    onChange={e => onInputChange('recoveryTime', e.target.value)}
                    type="number" step="1" min="0"
                />
            </div>
        )}
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <OutputCard
            label="MU/Gy Ratio"
            value={outputs.muGyRatio}
            colour="purple"
            feedback={outputs.muGyRatioFeedback}
        />
        <OutputCard label="Estimated Delivery Time (min)" value={outputs.deliveryTime} colour="indigo" />
    </div>
    {status && <div className="mt-8 text-center text-md md:text-lg font-medium text-red-500">{status}</div>}
    <div className="no-print flex justify-center mt-8">
        <button
            onClick={() => window.print()}
            className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold shadow-lg hover:bg-blue-700 transition duration-200"
        >
            <Printer size={20} className="mr-2" /> Print Report
        </button>
    </div>
  </div>
);

const InstitutionalData = ({ data, onTableChange, onAddRow, onRemoveRow, onToleranceChange, onSave, isSaving, saveStatus, userId }) => (
  <div className="page-content p-6">
    <h2 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-4 text-center">My Institutional Data</h2>
    <p className="text-gray-400 text-lg text-center mb-8">
      Enter and manage your own institutional benchmarks. The data will be used in the calculator when enabled and is private to your account.
      <br/>
      Your user ID: <span className="text-blue-400 font-mono break-all">{userId || 'Loading...'}</span>
    </p>
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700 mb-8">
        <h3 className="text-2xl font-bold text-blue-400 mb-4">Plan Tolerances</h3>
        <InputField
            label="CI100 Tolerance (e.g., 1.2)"
            value={data.ci100Tolerance}
            onChange={e => onToleranceChange(e.target.value)}
            step="0.01"
            min="0"
        />
    </div>
    <div className="bg-gray-800 rounded-xl p-6 shadow-lg border border-gray-700">
        <h3 className="text-2xl font-bold text-blue-400 mb-4">PTV Data Table</h3>
        <p className="text-gray-400 mb-4">
          Enter multiple data points for linear interpolation, or just two points to interpolate between them.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left rounded-lg overflow-hidden border border-gray-700">
            <thead className="bg-gray-700">
              <tr>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">PTV Volume (cc)</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">R50% Per Protocol</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">R50% Acceptable Variation</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">D2cm[%] Per Protocol</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">D2cm[%] Acceptable Variation</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-gray-900 divide-y divide-gray-800">
              {data.customTable.map((row, index) => (
                <tr key={index}>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.ptv}
                      onChange={e => onTableChange(index, 'ptv', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                      step="0.1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.r50p}
                      onChange={e => onTableChange(index, 'r50p', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                      step="0.01"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.r50v}
                      onChange={e => onTableChange(index, 'r50v', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                      step="0.01"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.d2cmp}
                      onChange={e => onTableChange(index, 'd2cmp', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                      step="0.1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={row.d2cmv}
                      onChange={e => onTableChange(index, 'd2cmv', e.target.value)}
                      className="w-full px-2 py-1 bg-gray-800 border border-gray-700 rounded-lg text-sm"
                      step="0.1"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button
                        onClick={() => onRemoveRow(index)}
                        className="text-red-500 hover:text-red-700 transition duration-200"
                        disabled={data.customTable.length === 1}
                    >
                        <Trash2 size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-start mt-4">
          <button
            onClick={onAddRow}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold shadow-md hover:bg-blue-700 transition duration-200"
          >
            <Plus size={20} className="mr-2" /> Add Row
          </button>
        </div>
    </div>
    <div className="flex justify-center mt-6">
      <button
        onClick={onSave}
        className={`flex items-center px-6 py-3 rounded-lg font-semibold transition-all duration-200 ${
          isSaving
            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
            : 'bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500'
        }`}
        disabled={isSaving}
      >
        {isSaving ? (
          <>
            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Saving...
          </>
        ) : <><Edit size={20} className="mr-2" /> Save My Data</>}
      </button>
    </div>
    {saveStatus === 'success' && (
      <div className="mt-4 p-4 rounded-lg bg-green-900/20 text-green-400 text-center">
        <p className="font-semibold">Data saved successfully!</p>
      </div>
    )}
    {saveStatus === 'error' && (
      <div className="mt-4 p-4 rounded-lg bg-red-900/20 text-red-400 text-center">
        <p className="font-semibold">Failed to save data. Please try again.</p>
      </div>
    )}
  </div>
);

const EducationPage = ({ expandedGlossaryTerm, onToggleGlossary }) => (
    <div className="page-content p-6">
      <h2 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-4 text-center">SABR Education & Principles</h2>
      <div className="prose prose-invert max-w-none">
        <p>
          Stereotactic Ablative Body Radiotherapy (SABR), also known as Stereotactic Body Radiation Therapy (SBRT), is a specialised form of external beam radiation therapy that delivers a very high dose of radiation to a small, well-defined target area. Unlike conventional radiation, which uses lower daily doses over many weeks, SABR uses a few high-dose fractions to precisely ablate the tumour.
        </p>

        <h3 className="text-2xl font-bold text-blue-400 mt-8 mb-4">What Makes a SABR Plan?</h3>
        <p>
          A well-designed SABR plan is characterised by its high precision and steep dose gradients. The goal is to deliver a lethal dose to the tumour while minimising dose to surrounding healthy tissues. Key characteristics include:
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>High Dose Per Fraction:</strong> Each treatment delivers a dose significantly higher than conventional radiotherapy.</li>
          <li><strong>Conformality:</strong> The high-dose region must tightly conform to the Planning Target Volume (PTV).</li>
          <li><strong>Steep Dose Fall-off:</strong> The dose must drop off very quickly outside the target to spare critical organs.</li>
          <li><strong>Motion Management:</strong> As SABR is often used for lung tumours, strategies like breath-hold or gating are crucial to manage tumour movement caused by breathing.</li>
        </ul>

        <h3 className="text-2xl font-bold text-blue-400 mt-8 mb-4">Key Challenges in SABR</h3>
        <p>
          SABR presents unique challenges for the clinical team, particularly for radiation therapists who are on the front lines of patient care and treatment delivery.
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>Intra-Fractional Motion:</strong> Tumours in the lung can move during the treatment due to patient breathing. This requires advanced imaging and motion management techniques to ensure the target is always within the treatment field.</li>
          <li><strong>Dose Spillage:</strong> The extremely high dose can be devastating to healthy tissue. Therefore, any dose "spillage" outside the PTV, even a small amount, must be carefully controlled and monitored.</li>
          <li><strong>Verification:</strong> Accurate patient setup and daily image verification are paramount. The small margins and high doses leave very little room for error.</li>
          <li><strong>Plan Quality Metrics:</strong> Understanding and interpreting plan metrics like the Conformity Index (CI), R50%, and D2cm is essential to ensure the plan meets safety and efficacy standards.</li>
        </ul>

        <h3 className="text-2xl font-bold text-blue-400 mt-8 mb-4">The Interplay Effect</h3>
        <p>
          The interplay effect is a specific challenge that arises in the treatment of moving tumours with dynamic delivery techniques like VMAT or IMRT. It refers to the complex interaction between the motion of the tumour (e.g., due to respiration) and the motion of the radiation beam delivery system (e.g., the moving multi-leaf collimator (MLC) leaves).
        </p>
        <p>
          Because both the target and the beam aperture are moving simultaneously, there's a risk that the planned dose distribution won't be accurately delivered. For example, a part of the tumour might move into a low-dose region just as the beam passes over it, leading to underdosing. Conversely, it might receive a higher dose than intended. Over the course of a single treatment fraction, these dose discrepancies can be significant.
        </p>
        <InterplayEffectAnimation />
        <p>
          However, the effect is often mitigated by several factors. The fractionation of SABR (delivering the treatment over several days) helps to average out the random dose errors. Furthermore, modern delivery techniques like VMAT deliver the dose from many different gantry angles, which also helps to "smear out" and reduce the overall impact of the interplay effect.
        </p>

        <h3 className="text-2xl font-bold text-blue-400 mt-8 mb-4">RTOG 0815 Guidelines</h3>
        <p>
          The RTOG 0815 clinical trial established key benchmarks for lung SABR plan quality. This calculator is based on these guidelines, which provide acceptable ranges for several critical metrics.
        </p>
        <ul className="list-disc list-inside space-y-2">
          <li><strong>R50%:</strong> The ratio of the volume encompassed by 50% of the prescription isodose line to the PTV volume. It's a key indicator of dose spillage. Lower values are better.</li>
          <li><strong>D2cm:</strong> The maximum dose to any point 2cm away from the PTV. This is another crucial measure of dose fall-off and organ-at-risk sparing.</li>
        </ul>
      </div>
      <div className="prose prose-invert max-w-none mt-12">
        <h3 className="text-2xl md:text-3xl font-bold text-cyan-400 mb-4 text-center">Interactive Glossary</h3>
        <p className="text-gray-400 text-lg text-center mb-8">Click on a term to see its definition.</p>
        <div className="space-y-4">
          {glossaryTerms.map((item, index) => (
            <div key={index} className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition duration-200"
              onClick={() => onToggleGlossary(index)}>
              <h3 className="text-xl font-semibold text-blue-400">{item.term}</h3>
              {expandedGlossaryTerm === index && (
                <p className="mt-2 text-gray-300 transition-all duration-300 ease-in-out">{item.definition}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
);

const ReviewSuggestions = ({ suggestions, userId }) => (
    <div className="page-content p-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl md:text-4xl font-bold text-cyan-400 mb-2">Review Suggestions</h1>
        <p className="text-gray-400 text-lg">
          View all the suggestions submitted by users. The suggestions are updated in real-time.
          <br/>
          Your user ID: <span className="text-blue-400 font-mono break-all">{userId || 'Loading...'}</span>
        </p>
      </div>
      <div className="space-y-4">
        {suggestions.length > 0 ? (
          suggestions.map((suggestion) => (
            <div key={suggestion.id} className="bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-700">
              <p className="text-gray-300 italic mb-2">"{suggestion.suggestionText}"</p>
              <div className="text-sm text-gray-500 mt-4 border-t border-gray-700 pt-2">
                <p>
                  Submitted by: <span className="font-mono text-gray-400 break-all">{suggestion.userId}</span>
                </p>
                <p>
                  Date: {suggestion.timestamp ? suggestion.timestamp.toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center text-gray-500 py-8">
            No suggestions have been submitted yet.
          </div>
        )}
      </div>
    </div>
);


// --- Main App component ---
const App = () => {
  const [activePage, setActivePage] = useState('calculator');
  const [rtogInputs, setRtogInputs] = useState({ ptvVolume: '', prescriptionDose: '' });
  const [advancedInputs, setAdvancedInputs] = useState({
    ptvVolume: '', v100: '', v50: '', v105: '',
    totalMUs: '', dosePerFraction: '', doseRate: '',
    breathHoldEnabled: false, holdTime: '25', recoveryTime: '10'
  });
  const [rtogOutputs, setRtogOutputs] = useState({});
  const [rtogTable, setRtogTable] = useState(ptvData);
  const [rtogStatus, setRtogStatus] = useState('');
  const [advancedOutputs, setAdvancedOutputs] = useState({});
  const [advancedStatus, setAdvancedStatus] = useState('');
  const [showSuggestionsModal, setShowSuggestionsModal] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [suggestionStatus, setSuggestionStatus] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [expandedGlossaryTerm, setExpandedGlossaryTerm] = useState(null);
  const [institutionalData, setInstitutionalData] = useState({
    ci100Tolerance: '1.2',
    customTable: [{ ptv: '', r50p: '', r50v: '', d2cmp: '', d2cmv: '' }]
  });
  const [isSavingInstitutional, setIsSavingInstitutional] = useState(false);
  const [saveStatusInstitutional, setSaveStatusInstitutional] = useState(null);
  const [useInstitutionalData, setUseInstitutionalData] = useState(false);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // Firestore Initialization
  useEffect(() => {
    const initFirebase = async () => {
      try {
        const app = initializeApp(firebaseConfig);
        const firestoreDb = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestoreDb);
        setAuth(firebaseAuth);

        onAuthStateChanged(firebaseAuth, async (user) => {
            if (user) {
                setUserId(user.uid);
            } else {
                try {
                    if (initialAuthToken) {
                        await signInWithCustomToken(firebaseAuth, initialAuthToken);
                    } else {
                        await signInAnonymously(firebaseAuth);
                    }
                    setUserId(firebaseAuth.currentUser?.uid || crypto.randomUUID());
                } catch (error) {
                    console.error('Firebase Auth Error:', error);
                    setUserId(crypto.randomUUID());
                }
            }
            setIsAuthReady(true);
        });
      } catch (error) {
        console.error('Firebase Initialization Error:', error);
      }
    };
    initFirebase();
  }, []);

  // Fetch suggestions
  useEffect(() => {
    if (!db || !isAuthReady) return;
    const suggestionsCollectionRef = collection(db, `artifacts/${appId}/public/data/suggestions`);
    const unsubscribe = onSnapshot(suggestionsCollectionRef, (snapshot) => {
        const fetchedSuggestions = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
            timestamp: doc.data().timestamp ? doc.data().timestamp.toDate() : null
        }));
        setSuggestions(fetchedSuggestions.sort((a, b) => b.timestamp - a.timestamp));
    }, (error) => {
        console.error("Error fetching suggestions: ", error);
    });
    return () => unsubscribe();
  }, [db, isAuthReady, appId]);

  // Fetch institutional data
  useEffect(() => {
    if (!db || !userId) return;
    const institutionalDataDocRef = doc(db, `artifacts/${appId}/users/${userId}/institutionalData/customValues`);
    const unsubscribe = onSnapshot(institutionalDataDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setInstitutionalData({
          ci100Tolerance: data.ci100Tolerance || '1.2',
          customTable: data.customTable && Array.isArray(data.customTable) && data.customTable.length > 0
            ? data.customTable
            : [{ ptv: '', r50p: '', r50v: '', d2cmp: '', d2cmv: '' }]
        });
      }
    }, (error) => {
      console.error("Error fetching institutional data: ", error);
    });
    return () => unsubscribe();
  }, [db, userId, appId]);

  // RTOG Calculator Logic
  useEffect(() => {
    const { ptvVolume, prescriptionDose } = rtogInputs;
    const ptv = parseFloat(ptvVolume);
    const dose = parseFloat(prescriptionDose);
    setRtogStatus('');
    const dataSet = useInstitutionalData && institutionalData.customTable.length > 0 && institutionalData.customTable[0].ptv !== ''
      ? institutionalData.customTable.sort((a, b) => a.ptv - b.ptv)
      : ptvData;

    if (isNaN(ptv) || (useInstitutionalData && (ptv < dataSet[0]?.ptv || ptv > dataSet[dataSet.length - 1]?.ptv))) {
      setRtogOutputs({ r50p: '-', r50v: '-', d2cmp: '-', d2cmv: '-', scorecardCI50: '-', ptv15Percent: '-', scorecardBody: '-', dose105Percent: '-', dose50Percent: '-' });
      if (useInstitutionalData && !isNaN(ptv)) { setRtogStatus(`Input PTV volume (${ptv}) is outside the range of your institutional data table.`); }
      setRtogTable(dataSet);
      return;
    }

    let lowerPoint = null;
    let upperPoint = null;
    for (let i = 0; i < dataSet.length - 1; i++) {
      if (ptv >= dataSet[i].ptv && ptv <= dataSet[i+1].ptv) {
        lowerPoint = dataSet[i];
        upperPoint = dataSet[i+1];
        break;
      }
    }
    if (!lowerPoint && dataSet.length === 1) { lowerPoint = dataSet[0]; upperPoint = dataSet[0]; }
    if (lowerPoint && upperPoint) {
      const r50p = interpolate(ptv, lowerPoint.ptv, lowerPoint.r50p, upperPoint.ptv, upperPoint.r50p);
      const r50v = interpolate(ptv, lowerPoint.ptv, lowerPoint.r50v, upperPoint.ptv, upperPoint.r50v);
      const d2cmp = interpolate(ptv, lowerPoint.ptv, lowerPoint.d2cmp, upperPoint.ptv, upperPoint.d2cmp);
      const d2cmv = interpolate(ptv, lowerPoint.ptv, lowerPoint.d2cmv, upperPoint.ptv, upperPoint.d2cmv);
      const scorecardCI50 = r50p * ptv;
      const ptv15Percent = ptv * 0.15;
      const newOutputs = {
        r50p: r50p.toFixed(2), r50v: r50v.toFixed(2), d2cmp: d2cmp.toFixed(2), d2cmv: d2cmv.toFixed(2),
        scorecardCI50: scorecardCI50.toFixed(2), ptv15Percent: ptv15Percent.toFixed(2),
        scorecardBody: isNaN(dose) ? '-' : ((d2cmp / 100) * dose).toFixed(2),
        dose105Percent: isNaN(dose) ? '-' : (dose * 1.05).toFixed(2),
        dose50Percent: isNaN(dose) ? '-' : (dose * 0.50).toFixed(2),
      };
      setRtogOutputs(newOutputs);
      const newTable = [...dataSet];
      if (!newTable.find(row => parseFloat(row.ptv) === ptv)) {
        const interpolatedRow = { ptv: ptv.toFixed(1), r50p: newOutputs.r50p, r50v: newOutputs.r50v, d2cmp: newOutputs.d2cmp, d2cmv: newOutputs.d2cmv, interpolated: true };
        const insertIndex = newTable.findIndex(row => ptv < parseFloat(row.ptv));
        if (insertIndex === -1) { newTable.push(interpolatedRow); } else { newTable.splice(insertIndex, 0, interpolatedRow); }
      }
      setRtogTable(newTable);
    } else {
      setRtogStatus('Could not find data points for interpolation. Please enter a PTV volume within the RTOG range or use your own institutional data.');
    }
  }, [rtogInputs, useInstitutionalData, institutionalData.customTable]);

  // Advanced Metrics Logic
  useEffect(() => {
    const { ptvVolume, v100, v50, v105, totalMUs, dosePerFraction, doseRate, breathHoldEnabled, holdTime, recoveryTime } = advancedInputs;
    const ptv = parseFloat(ptvVolume); const v100Vol = parseFloat(v100); const v50Vol = parseFloat(v50); const v105Vol = parseFloat(v105);
    const mu = parseFloat(totalMUs); const dose = parseFloat(dosePerFraction); const rate = parseFloat(doseRate);
    const holdSeconds = parseFloat(holdTime); const recoverySeconds = parseFloat(recoveryTime);
    setAdvancedStatus('');
    let newOutputs = { ci100: '-', ci50: '-', spillageVolume: '-', ptv15Tolerance: '-', muGyRatio: '-', deliveryTime: '-', muGyRatioFeedback: '-', ci100Status: null, ci50Status: null, spillageStatus: null };
    const dataSet = useInstitutionalData && institutionalData.customTable.length > 0 && institutionalData.customTable[0].ptv !== ''
      ? institutionalData.customTable.sort((a, b) => a.ptv - b.ptv)
      : ptvData;
    const ci100Tolerance = useInstitutionalData ? parseFloat(institutionalData.ci100Tolerance) : 1.2;
    if (!isNaN(ptv) && !isNaN(v100Vol) && ptv > 0 && !isNaN(ci100Tolerance)) { const ci100Value = v100Vol / ptv; newOutputs.ci100 = ci100Value.toFixed(2); newOutputs.ci100Status = ci100Value <= ci100Tolerance ? 'pass' : 'fail'; }
    if (!isNaN(ptv) && !isNaN(v50Vol) && ptv > 0) {
      const ci50Value = v50Vol / ptv; newOutputs.ci50 = ci50Value.toFixed(2);
      let lowerPoint = null; let upperPoint = null;
      for (let i = 0; i < dataSet.length - 1; i++) {
        if (ptv >= dataSet[i].ptv && ptv <= dataSet[i+1].ptv) { lowerPoint = dataSet[i]; upperPoint = dataSet[i+1]; break; }
      }
      if (!lowerPoint && dataSet.length === 1) { lowerPoint = dataSet[0]; upperPoint = dataSet[0]; }
      if (lowerPoint && upperPoint) {
        const r50p = interpolate(ptv, lowerPoint.ptv, lowerPoint.r50p, upperPoint.ptv, upperPoint.r50p);
        const r50v = interpolate(ptv, lowerPoint.ptv, lowerPoint.r50v, upperPoint.ptv, upperPoint.r50v);
        if (ci50Value <= r50p) { newOutputs.ci50Status = 'pass'; } else if (ci50Value <= r50v) { newOutputs.ci50Status = 'acceptable'; } else { newOutputs.ci50Status = 'fail'; }
      } else { newOutputs.ci50Status = 'n/a'; }
    }
    if (!isNaN(ptv) && !isNaN(v105Vol) && ptv > 0) { const spillageVolume = v105Vol - ptv; const ptv15PercentVolume = ptv * 0.15; newOutputs.spillageVolume = spillageVolume.toFixed(2); newOutputs.ptv15Tolerance = ptv15PercentVolume.toFixed(2); newOutputs.spillageStatus = spillageVolume <= ptv15PercentVolume ? 'pass' : 'fail'; }
    if (!isNaN(mu) && !isNaN(dose) && dose > 0) { const muGyRatio = mu / dose; newOutputs.muGyRatio = muGyRatio.toFixed(2); if (muGyRatio < 230) { newOutputs.muGyRatioFeedback = 'Low'; } else if (muGyRatio <= 280) { newOutputs.muGyRatioFeedback = 'Average'; } else { newOutputs.muGyRatioFeedback = 'High'; } } else { newOutputs.muGyRatioFeedback = '-'; }
    if (!isNaN(mu) && !isNaN(rate) && rate > 0) {
      let deliveryTimeInMinutes = (mu / rate);
      if (breathHoldEnabled && !isNaN(holdSeconds) && !isNaN(recoverySeconds) && holdSeconds > 0) {
        const totalBeamOnSeconds = deliveryTimeInMinutes * 60;
        const numberOfHolds = Math.ceil(totalBeamOnSeconds / holdSeconds);
        const totalRecoverySeconds = numberOfHolds * recoverySeconds;
        const totalDeliverySeconds = totalBeamOnSeconds + totalRecoverySeconds;
        deliveryTimeInMinutes = totalDeliverySeconds / 60;
      }
      newOutputs.deliveryTime = deliveryTimeInMinutes.toFixed(2);
    }
    setAdvancedOutputs(newOutputs);
  }, [advancedInputs, useInstitutionalData, institutionalData.customTable, institutionalData.ci100Tolerance]);

  // Dynamic CI50 graph ranges
  const ci50GraphRanges = useMemo(() => {
    const ptv = parseFloat(advancedInputs.ptvVolume);
    const dataSet = useInstitutionalData && institutionalData.customTable.length > 0 && institutionalData.customTable[0].ptv !== ''
      ? institutionalData.customTable.sort((a, b) => a.ptv - b.ptv) : ptvData;
    if (isNaN(ptv) || (useInstitutionalData && (ptv < dataSet[0]?.ptv || ptv > dataSet[dataSet.length - 1]?.ptv))) {
        return { perProtocol: { min: 0, max: 0 }, acceptable: { min: 0, max: 0 } };
    }
    let lowerPoint = null;
    let upperPoint = null;
    for (let i = 0; i < dataSet.length - 1; i++) {
        if (ptv >= dataSet[i].ptv && ptv <= dataSet[i+1].ptv) { lowerPoint = dataSet[i]; upperPoint = dataSet[i+1]; break; }
    }
    if (!lowerPoint && dataSet.length === 1) { lowerPoint = dataSet[0]; upperPoint = dataSet[0]; }
    const r50p = lowerPoint && upperPoint ? interpolate(ptv, lowerPoint.ptv, lowerPoint.r50p, upperPoint.ptv, upperPoint.r50p) : 0;
    const r50v = lowerPoint && upperPoint ? interpolate(ptv, lowerPoint.ptv, lowerPoint.r50v, upperPoint.ptv, upperPoint.r50v) : 0;
    return {
        perProtocol: { min: 0, max: parseFloat(r50p) || 0 },
        acceptable: { min: 0, max: parseFloat(r50v) || 0 }
    };
  }, [advancedInputs.ptvVolume, useInstitutionalData, institutionalData.customTable]);

  // Handlers for Institutional Data
  const handleSaveInstitutionalData = async () => {
    if (!db || !userId) { setSaveStatusInstitutional('error'); console.error('Firestore not initialized or user not authenticated.'); return; }
    setIsSavingInstitutional(true); setSaveStatusInstitutional(null);
    try {
      const docRef = doc(db, `artifacts/${appId}/users/${userId}/institutionalData/customValues`);
      await setDoc(docRef, { ci100Tolerance: parseFloat(institutionalData.ci100Tolerance) || 1.2,
        customTable: institutionalData.customTable.map(row => ({
            ptv: parseFloat(row.ptv) || 0, r50p: parseFloat(row.r50p) || 0, r50v: parseFloat(row.r50v) || 0,
            d2cmp: parseFloat(row.d2cmp) || 0, d2cmv: parseFloat(row.d2cmv) || 0,
        }))
      });
      setSaveStatusInstitutional('success');
    } catch (error) { console.error('Error saving institutional data:', error); setSaveStatusInstitutional('error'); }
    setIsSavingInstitutional(false);
  };
  const handleAddRow = () => { setInstitutionalData(prevData => ({ ...prevData, customTable: [...prevData.customTable, { ptv: '', r50p: '', r50v: '', d2cmp: '', d2cmv: '' }] })); };
  const handleRemoveRow = (index) => { setInstitutionalData(prevData => { const newTable = [...prevData.customTable]; newTable.splice(index, 1); if (newTable.length === 0) { newTable.push({ ptv: '', r50p: '', r50v: '', d2cmp: '', d2cmv: '' }); } return { ...prevData, customTable: newTable }; }); };
  const handleTableChange = (index, field, value) => { setInstitutionalData(prevData => { const newTable = [...prevData.customTable]; newTable[index][field] = value; return { ...prevData, customTable: newTable }; }); };
  const handleCi100ToleranceChange = (value) => { setInstitutionalData(prevData => ({ ...prevData, ci100Tolerance: value })); };

  // Handlers for Suggestions
  const handleSendSuggestion = async () => {
    if (!suggestionText.trim() || !db) { setSuggestionStatus('Please enter a suggestion.'); return; }
    setIsSubmitting(true); setSuggestionStatus(null);
    try {
      const suggestionsCollectionRef = collection(db, `artifacts/${appId}/public/data/suggestions`);
      await addDoc(suggestionsCollectionRef, { suggestionText: suggestionText, timestamp: serverTimestamp(), userId: userId });
      setSuggestionStatus('success'); setSuggestionText('');
    } catch (error) { console.error('Error adding suggestion to Firestore:', error); setSuggestionStatus('error'); }
    setIsSubmitting(false);
  };
  const handleCloseSuggestionsModal = () => { setShowSuggestionsModal(false); setSuggestionStatus(null); setSuggestionText(''); };

  // Render the active page
  const renderPage = () => {
    switch (activePage) {
      case 'calculator':
        return <RTOGCalculator
          inputs={rtogInputs}
          onInputChange={(field, value) => setRtogInputs({...rtogInputs, [field]: value})}
          useInstitutionalData={useInstitutionalData}
          onToggleUseInstitutional={() => setUseInstitutionalData(!useInstitutionalData)}
          outputs={rtogOutputs}
          status={rtogStatus}
          table={rtogTable}
        />;
      case 'advanced':
        return <AdvancedMetrics
          inputs={advancedInputs}
          onInputChange={(field, value) => setAdvancedInputs({...advancedInputs, [field]: value})}
          outputs={advancedOutputs}
          status={advancedStatus}
          ci50Value={parseFloat(advancedOutputs.ci50)}
          ci50GraphRanges={ci50GraphRanges}
          useInstitutionalData={useInstitutionalData}
          onToggleUseInstitutional={() => setUseInstitutionalData(!useInstitutionalData)}
        />;
      case 'institutional':
        return <InstitutionalData
          data={institutionalData}
          onTableChange={handleTableChange}
          onAddRow={handleAddRow}
          onRemoveRow={handleRemoveRow}
          onToleranceChange={handleCi100ToleranceChange}
          onSave={handleSaveInstitutionalData}
          isSaving={isSavingInstitutional}
          saveStatus={saveStatusInstitutional}
          userId={userId}
        />;
      case 'education':
        return <EducationPage expandedGlossaryTerm={expandedGlossaryTerm} onToggleGlossary={setExpandedGlossaryTerm} />;
      case 'review':
        return <ReviewSuggestions suggestions={suggestions} userId={userId} />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 relative">
      <style>
        {`
          @media print {
            body { background-color: #fff !important; color: #000 !important; }
            .no-print { display: none !important; }
            .print-only { display: block !important; }
            .print-area { margin: 0; padding: 0; }
            .print-area .bg-gray-900, .print-area .bg-gray-800, .print-area .border-gray-700 { background-color: #fff !important; border-color: #eee !important; }
            .print-area .text-gray-100, .print-area .text-gray-300, .print-area .text-gray-400 { color: #000 !important; }
            .print-area .text-cyan-400, .print-area .text-blue-400 { color: #2563eb !important; }
            h1, h2, h3 { color: #000 !important; }
          }
          .print-only { display: none; }
        `}
      </style>
      <div className="max-w-5xl mx-auto bg-gray-900 rounded-2xl shadow-2xl overflow-hidden p-6 md:p-8 border border-gray-700">
        <nav className="no-print flex flex-wrap justify-center md:justify-start space-x-2 md:space-x-4 mb-8 border-b border-gray-700 pb-4">
          <NavLink label="RTOG 0815 Calculator" active={activePage === 'calculator'} onClick={() => setActivePage('calculator')} />
          <NavLink label="Plan Metric Analysis" active={activePage === 'advanced'} onClick={() => setActivePage('advanced')} />
          <NavLink label="Institutional Data" active={activePage === 'institutional'} onClick={() => setActivePage('institutional')} />
          <NavLink label="SABR Education" active={activePage === 'education'} onClick={() => setActivePage('education')} />
          <NavLink label="Review Suggestions" active={activePage === 'review'} onClick={() => setActivePage('review')} />
        </nav>
        {renderPage()}
      </div>
      <footer className="no-print mt-12 text-center text-sm text-gray-500">
          &copy; 2025 Kaiden Connor. All rights reserved.
          <button
            onClick={() => setShowSuggestionsModal(true)}
            className="flex items-center justify-center px-4 py-2 mt-4 mx-auto text-blue-300 bg-gray-800 rounded-lg shadow-md hover:bg-gray-700 transition duration-200"
          >
            <Lightbulb size={18} className="mr-2" /> Suggest an Edit
          </button>
      </footer>
      <SuggestionsModal
        show={showSuggestionsModal}
        onClose={handleCloseSuggestionsModal}
        onSend={handleSendSuggestion}
        suggestionText={suggestionText}
        onTextChange={(e) => setSuggestionText(e.target.value)}
        isSubmitting={isSubmitting}
        status={suggestionStatus}
      />
    </div>
  );
};

export default App;
