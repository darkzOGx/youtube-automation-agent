import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface InfoTooltipProps {
  text: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
  text,
  children,
  maxWidth = 200
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const updateCoords = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  };

  // Update coords on scroll or resize if visible
  useEffect(() => {
    if (isVisible) {
      window.addEventListener('scroll', updateCoords, true);
      window.addEventListener('resize', updateCoords);
    }
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
    };
  }, [isVisible]);

  return (
    <div
      className="relative inline-flex"
      ref={triggerRef}
      onMouseEnter={() => {
        updateCoords();
        setIsVisible(true);
      }}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}

      {isVisible && createPortal(
        <div
          className="fixed bg-darkDelegation text-white text-[10px] px-3 py-2 rounded-lg shadow-2xl z-[9999] pointer-events-none border border-darkDelegation text-center animate-in fade-in zoom-in-95 duration-200"
          style={{
            left: coords.x,
            top: coords.y - 8,
            transform: 'translate(-50%, -100%)',
            maxWidth: `${maxWidth}px`,
            width: 'max-content'
          }}
        >
          {text}
          {/* Arrow */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-darkDelegation"
          />
        </div>,
        document.body
      )}
    </div>
  );
};
