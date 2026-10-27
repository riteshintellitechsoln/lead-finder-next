'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('');
  const timer = useRef();

  const toast = useCallback((msg) => {
    setMessage(msg);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(''), 2800);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast" role="status" hidden={!message}>
        {message}
      </div>
    </ToastContext.Provider>
  );
}
