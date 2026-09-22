import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  X, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  Maximize2,
  RefreshCw
} from 'lucide-react';
import { Button } from './ui/button';
import { AttachmentItem } from './ModelResponseView';

interface ImageZoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: Array<{
    id?: string;
    name?: string;
    url: string;
    size?: number;
    type?: string;
  }>;
  initialIndex?: number;
}

export function ImageZoomModal({
  isOpen,
  onClose,
  images,
  initialIndex = 0
}: ImageZoomModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync initialIndex when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(Math.max(0, Math.min(initialIndex, images.length - 1)));
      resetTransform();
    }
  }, [isOpen, initialIndex, images.length]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, []);

  const handleNext = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % images.length);
    resetTransform();
  }, [images.length, resetTransform]);

  const handlePrev = useCallback(() => {
    if (images.length <= 1) return;
    setCurrentIndex((prev) => (prev - 1 + images.length) % images.length);
    resetTransform();
  }, [images.length, resetTransform]);

  // Keyboard navigation & zoom
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      } else if (e.key === '+' || e.key === '=') {
        setScale((prev) => Math.min(prev + 0.25, 4));
      } else if (e.key === '-' || e.key === '_') {
        setScale((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === '0') {
        resetTransform();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, handleNext, handlePrev, resetTransform]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.2 : -0.2;
    setScale((prev) => Math.min(Math.max(prev + delta, 0.5), 4));
  };

  // Mouse drag to pan
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

  // Double click to toggle zoom (1x <-> 2x)
  const handleDoubleClick = () => {
    if (scale > 1) {
      resetTransform();
    } else {
      setScale(2);
    }
  };

  if (!isOpen || images.length === 0) return null;

  const currentImg = images[currentIndex];
  if (!currentImg || !currentImg.url) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex flex-col bg-black/92 backdrop-blur-md select-none animate-in fade-in duration-200"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      {/* Top Controls Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-white/10 text-white z-10">
        <div className="flex items-center gap-3">
          <span className="font-semibold text-sm tracking-wide text-white truncate max-w-[200px] sm:max-w-md">
            {currentImg.name || `Photo ${currentIndex + 1}`}
          </span>
          {images.length > 1 && (
            <span className="bg-white/15 px-2 py-0.5 rounded text-xs text-white/80 font-mono">
              {currentIndex + 1} / {images.length}
            </span>
          )}
          {scale > 1 && (
            <span className="bg-indigo-500/80 px-2 py-0.5 rounded text-xs text-white font-mono">
              {Math.round(scale * 100)}%
            </span>
          )}
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScale((prev) => Math.max(prev - 0.25, 0.5))}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15"
            title="Zoom Out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setScale((prev) => Math.min(prev + 0.25, 4))}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15"
            title="Zoom In (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => setRotation((prev) => (prev + 90) % 360)}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15"
            title="Rotate 90°"
          >
            <RotateCw className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={resetTransform}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-white/15"
            title="Reset Zoom & Position (0)"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          <a
            href={currentImg.url}
            download={currentImg.name || 'fit_photo.jpg'}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            title="Download Original"
          >
            <Download className="w-4 h-4" />
          </a>

          <div className="w-px h-5 bg-white/20 mx-1" />

          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-white/80 hover:text-white hover:bg-red-500/80 rounded-full"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Main Viewport Container */}
      <div 
        ref={containerRef}
        className="flex-1 relative flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing p-4"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        {/* Navigation Arrows */}
        {images.length > 1 && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handlePrev();
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-sm border border-white/15 transition-all shadow-lg hover:scale-105"
              title="Previous photo (Left arrow)"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                handleNext();
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-20 h-11 w-11 rounded-full bg-black/60 hover:bg-black/85 text-white/90 hover:text-white flex items-center justify-center backdrop-blur-sm border border-white/15 transition-all shadow-lg hover:scale-105"
              title="Next photo (Right arrow)"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}

        {/* The Zoomable Image */}
        <div 
          className="transition-transform duration-75 ease-out select-none flex items-center justify-center max-w-full max-h-full"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale}) rotate(${rotation}deg)`,
            cursor: scale > 1 ? (isDragging ? 'grabbing' : 'grab') : 'zoom-in'
          }}
        >
          <img
            src={currentImg.url}
            alt={currentImg.name || 'Fit Photo'}
            className="max-h-[82vh] max-w-[90vw] object-contain rounded shadow-2xl pointer-events-none select-none"
            draggable={false}
          />
        </div>

        {/* Tip hint at bottom of viewport */}
        <div className="absolute bottom-3 left-1/2 -translate-y-0 -translate-x-1/2 bg-black/60 border border-white/10 backdrop-blur-sm text-white/70 text-[11px] px-3 py-1 rounded-full pointer-events-none flex items-center gap-2">
          <span>Scroll wheel / double click to zoom</span>
          <span>•</span>
          <span>Drag to pan</span>
          <span>•</span>
          <span>Esc to exit</span>
        </div>
      </div>

      {/* Bottom Thumbnail Strip (if multiple photos) */}
      {images.length > 1 && (
        <div className="py-2.5 px-4 bg-black/60 border-t border-white/10 flex items-center justify-center gap-2 overflow-x-auto z-10">
          {images.map((img, idx) => (
            <button
              key={idx}
              onClick={() => {
                setCurrentIndex(idx);
                resetTransform();
              }}
              className={`relative h-12 w-12 rounded overflow-hidden border-2 transition-all shrink-0 ${
                idx === currentIndex 
                  ? 'border-indigo-400 scale-105 shadow-md' 
                  : 'border-white/20 opacity-60 hover:opacity-100 hover:border-white/50'
              }`}
            >
              <img 
                src={img.url} 
                alt={img.name || `Thumb ${idx + 1}`} 
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 right-0 bg-black/70 text-[9px] text-white font-mono px-1">
                {idx + 1}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
