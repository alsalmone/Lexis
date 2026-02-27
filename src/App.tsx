import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Navbar } from '@/components/Layout/Navbar';
import { BookBrowser } from '@/components/BookBrowser/BookBrowser';
import { Reader } from '@/components/Reader/Reader';
import { Settings } from '@/components/Settings/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<BookBrowser />} />
        <Route path="/read/:bookId" element={<Reader />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
