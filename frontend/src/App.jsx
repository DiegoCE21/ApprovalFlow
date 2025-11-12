import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AprobarDocumento from './pages/AprobarDocumento';
import SubirDocumento from './pages/SubirDocumento';
import VerDocumento from './pages/VerDocumento';
import DefinirPosicionesFirmas from './pages/DefinirPosicionesFirmas';
import SubirNuevaVersion from './pages/SubirNuevaVersion';
import GestionPermisos from './pages/GestionPermisos';
import GestionGruposFirmantes from './pages/GestionGruposFirmantes';
import theme from './theme/theme';

// Componente para proteger rutas
const ProtectedRoute = ({ children }) => {
  const user = localStorage.getItem('user');
  if (!user) {
    // Si estamos en la página de aprobar, preservar el token en la redirección
    const currentPath = window.location.pathname;
    if (currentPath.startsWith('/aprobar/')) {
      return <Navigate to={`/login?redirect=${currentPath}`} />;
    }
    return <Navigate to="/login" />;
  }
  return children;
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/dashboard" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/subir-documento" 
            element={
              <ProtectedRoute>
                <SubirDocumento />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/definir-posiciones" 
            element={
              <ProtectedRoute>
                <DefinirPosicionesFirmas />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/documento/:id" 
            element={
              <ProtectedRoute>
                <VerDocumento />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/subir-nueva-version/:id" 
            element={
              <ProtectedRoute>
                <SubirNuevaVersion />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/gestion-permisos" 
            element={
              <ProtectedRoute>
                <GestionPermisos />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/gestion-grupos" 
            element={
              <ProtectedRoute>
                <GestionGruposFirmantes />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/aprobar/:token" 
            element={
              <ProtectedRoute>
                <AprobarDocumento />
              </ProtectedRoute>
            } 
          />
          <Route path="/" element={<Navigate to="/dashboard" />} />
        </Routes>
      </Router>
      <ToastContainer
        position="top-right"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
      />
    </ThemeProvider>
  );
}

export default App;
