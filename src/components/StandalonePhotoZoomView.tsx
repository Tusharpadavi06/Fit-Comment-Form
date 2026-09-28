import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2,
  RefreshCw,
  ArrowLeft,
  ExternalLink,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from './ui/button';
import { supabase } from '../lib/supabase';

interface PhotoItem {
  id?: string;
  name?: string;
  url: string;
  thumb?: string;
  size?: number;
}

export function StandalonePhotoZoomView() {
  const query = new URLSearchParams(window.location.search);
  const rawUrl = query.get('url') || '';
  const fileId = query.get('fileId') || '';
  const styleNo = query.get('styleNo') || query.get('style') || '';
  const round = query.get('round') || '1';
  const submissionId = query.get('submissionId') || query.get('subId') || '';
  const assignmentId = query.get('assignmentId') || '';

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [loading, setLoading] = useState(true);

  // Derive initial photos from URL parameters
  useEffect(() => {
    let initialList: PhotoItem[] = [];

    if (rawUrl) {
      initialList.push({
        id: fileId || 'direct-url',
        name: styleNo ? `${styleNo} (R${round})` : 'Fit Photo',
        url: rawUrl,
        thumb: rawUrl
      });
    } else if (fileId) {
      const cdnUrl = `https://lh3.googleusercontent.com/d/${fileId}=s0`;
      const thumbUrl = `https://lh3.googleusercontent.com/d/${fileId}=s200`;
      initialList.push({
        id: fileId,
        name: styleNo ? `${styleNo} (R${round})` : 'Fit Photo',
        url: cdnUrl,
        thumb: thumbUrl
      });
    }

    setPhotos(initialList);

    // If submissionId & round are available, attempt to fetch all photos from Supabase/cache
    const fetchRoundPhotos = async () => {
      if (!submissionId) {
        setLoading(false);
        return;
      }

      try {
        // Check cache first
        const cacheKey = `fit_cache_sub_${submissionId}`;
        const cached = localStorage.getItem(cacheKey);
        let subData: any = cached ? JSON.parse(cached) : null;

        if (!subData) {
          const { data } = await supabase
            .from('submissions')
            .select('*')
            .eq('id', submissionId)
            .maybeSingle();
          if (data) subData = data;
        }

        if (subData) {
          const roundKey = `round${round}`;
          const rData = subData[roundKey];
          if (rData && Array.isArray(rData.attachments) && rData.attachments.length > 0) {
            const fetchedList: PhotoItem[] = rData.attachments
              .filter((a: any) => (a.dataUrl || a.url) && (!a.type || a.type.startsWith('image/')))
              .map((a: any, idx: number) => ({
                id: a.id || `att-${idx}`,
                name: a.name || `Photo ${idx + 1}`,
                url: a.dataUrl || a.url,
                thumb: a.dataUrl || a.url,
                size: a.size
              }));

            if (fetchedList.length > 0) {
              setPhotos(fetchedList);
              // If fileId or rawUrl matched one of them, select it
              const matchedIdx = fetchedList.findIndex(
                p => p.url === rawUrl || (fileId && p.id === fileId)
              );
              if (matchedIdx >= 0) setCurrentIndex(matchedIdx);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load extra round photos:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchRoundPhotos();
  }, [fileId, rawUrl, styleNo, round, submissionId]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleNext = useCallback(() => {
    if (photos.length <= 1) return;
    setCurrentIndex(prev => (prev + 1) % photos.length);
    resetTransform();
  }, [photos.length, resetTransform]);

  const handlePrev = useCallback(() => {
    if (photos.length <= 1) return;
    setCurrentIndex(prev => (prev - 1 + photos.length) % photos.length);
    resetTransform();
  }, [photos.length, resetTransform]);

  // Keyboard navigation & controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') handleNext();
      else if (e.key === 'ArrowLeft') handlePrev();
      else if (e.key === '+' || e.key === '=') setScale(prev => Math.min(prev + 0.25, 5));
      else if (e.key === '-' || e.key === '_') setScale(prev => Math.max(prev - 0.25, 0.4));
      else if (e.key === '0') resetTransform();
      else if (e.key === 'r' || e.key === 'R') setRotation(prev => (prev + 90) % 360);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleNext, handlePrev, resetTransform]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    setScale(prev => Math.min(Math.max(prev + delta, 0.4), 6));
  };

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (scale > 1.2) {
      resetTransform();
    } else {
      setScale(2.5);
    }
  };

  const currentPhoto = photos[currentIndex];

  const handleDownload = () => {
    if (!currentPhoto?.url) return;
    const a = document.createElement('a');
    a.href = currentPhoto.url;
    a.download = currentPhoto.name || `Fit_Photo_${styleNo || 'Sample'}_R${round}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleBackToApp = () => {
    if (submissionId && assignmentId) {
      window.location.search = `?submissionId=${submissionId}&assignmentId=${assignmentId}&round=${round}`;
    } else {
      window.location.search = '';
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-[#070a11] text-slate-100 select-none overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Header Controls */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBackToApp}
            className="text-slate-300 hover:text-white hover:bg-slate-800 gap-1.5 text-xs h-8 px-2.5"
            title="Return to Feedback Form"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Form</span>
          </Button>

          <div className="h-4 w-px bg-slate-700" />

          <div className="flex items-center gap-2">
            <span className="bg-indigo-600 text-white font-bold text-[11px] px-2 py-0.5 rounded shadow-xs">
              Round {round}
            </span>
            <div>
              <h1 className="text-sm font-semibold text-white truncate max-w-[200px] sm:max-w-xs">
                {styleNo ? `Style: ${styleNo}` : 'Fit Photo Zoom'}
              </h1>
              <p className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-xs">
                {currentPhoto?.name || 'High-Resolution Inspection'}
              </p>
            </div>
          </div>

          {photos.length > 1 && (
            <span className="bg-slate-800 border border-slate-700 text-slate-300 text-xs px-2 py-0.5 rounded-full font-mono">
              {currentIndex + 1} / {photos.length}
            </span>
          )}
        </div>

        {/* Zoom Controls & Tools */}
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="flex items-center bg-slate-800/80 border border-slate-700/80 rounded-lg p-0.5">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setScale(prev => Math.max(prev - 0.25, 0.4))}
              className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-700"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </Button>
            <span className="text-xs font-mono font-medium px-2 min-w-[48px] text-center text-indigo-300">
              {Math.round(scale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setScale(prev => Math.min(prev + 0.25, 5))}
              className="h-7 w-7 text-slate-300 hover:text-white hover:bg-slate-700"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </Button>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={resetTransform}
            className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 gap-1 hidden sm:inline-flex"
            title="Reset to Fit View"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Fit
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRotation(prev => (prev + 90) % 360)}
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800"
            title="Rotate 90° (R)"
          >
            <RotateCw className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={handleDownload}
            className="h-8 w-8 text-slate-300 hover:text-white hover:bg-slate-800"
            title="Download HD Photo"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Main Viewport Stage */}
      <main 
        className="flex-1 relative overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing bg-[#05070c]"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Floating Hint Pill */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md border border-slate-700/60 px-3 py-1 rounded-full text-[11px] text-slate-400 pointer-events-none z-10 hidden sm:flex items-center gap-2">
          <span>💡 Scroll to Zoom</span>
          <span>•</span>
          <span>Drag to Pan</span>
          <span>•</span>
          <span>Double-Click to Toggle 2x</span>
        </div>

        {/* Prev / Next Arrows */}
        {photos.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-slate-900/80 hover:bg-indigo-600 border border-slate-700/60 text-white flex items-center justify-center transition-all shadow-lg"
              title="Previous Photo (Left Arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-10 w-10 rounded-full bg-slate-900/80 hover:bg-indigo-600 border border-slate-700/60 text-white flex items-center justify-center transition-all shadow-lg"
              title="Next Photo (Right Arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* The Image Element */}
        {currentPhoto?.url ? (
          <img
            src={currentPhoto.url}
            alt={currentPhoto.name || 'Fit Photo Zoom'}
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
              transition: isDragging ? 'none' : 'transform 0.15s ease-out'
            }}
            className="max-h-[85vh] max-w-[90vw] object-contain shadow-2xl rounded-sm pointer-events-none"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-500 gap-2 p-8 text-center">
            <ImageIcon className="w-12 h-12 text-slate-600" />
            <p className="text-sm font-medium">No photo URL found</p>
            <p className="text-xs text-slate-600 max-w-sm">
              Please ensure this link contains a valid photo URL or file ID parameter.
            </p>
          </div>
        )}
      </main>

      {/* Bottom Thumbnail Gallery Bar (if multiple photos exist) */}
      {photos.length > 1 && (
        <footer className="h-18 bg-slate-900/90 border-t border-slate-800 px-4 py-2 flex items-center gap-3 overflow-x-auto z-20">
          {photos.map((p, idx) => (
            <button
              key={p.id || idx}
              type="button"
              onClick={() => {
                setCurrentIndex(idx);
                resetTransform();
              }}
              className={`h-12 w-12 rounded-md overflow-hidden border-2 flex-shrink-0 transition-all cursor-pointer ${
                idx === currentIndex
                  ? 'border-indigo-500 ring-2 ring-indigo-500/40 opacity-100 scale-105'
                  : 'border-slate-700 opacity-60 hover:opacity-90'
              }`}
              title={p.name || `Photo ${idx + 1}`}
            >
              <img
                src={p.thumb || p.url}
                alt={p.name || `Photo ${idx + 1}`}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </footer>
      )}
    </div>
  );
}
