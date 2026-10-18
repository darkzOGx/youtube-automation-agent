import { HelpCircle } from 'lucide-react';
import React from 'react';
import { USER_COLOR } from '../../theme/brand';
import { InfoTooltip } from './InfoTooltip';

interface InfoBubbleProps {
  text: string;
}

export const InfoBubble: React.FC<InfoBubbleProps> = ({ text }) => {
  return (
    <InfoTooltip text={text}>
      <div className="text-zinc-300 hover:text-[var(--user-color)] transition-colors cursor-pointer outline-none ml-1" style={{ '--user-color': USER_COLOR } as React.CSSProperties}>
        <HelpCircle size={12} strokeWidth={2.5} />
      </div>
    </InfoTooltip>
  );
};
