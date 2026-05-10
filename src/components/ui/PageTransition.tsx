import React from 'react';

interface PageTransitionProps {
  children: React.ReactNode;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out fill-mode-forwards">
      {children}
    </div>
  );
};
