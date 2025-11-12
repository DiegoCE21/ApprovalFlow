import axios from 'axios';

// Obtener la URL del API desde las variables de entorno
// En desarrollo: import.meta.env.VITE_API_URL
// En producción: se debe configurar en el .env
let API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3301';

// Normalizar la URL: asegurar que tenga protocolo
if (API_URL && !API_URL.startsWith('http://') && !API_URL.startsWith('https://')) {
  // Si no tiene protocolo, agregar http://
  API_URL = `http://${API_URL}`;
}

// Remover barra final si existe
API_URL = API_URL.replace(/\/$/, '');

// Log para debug
console.log('[AXIOS] API URL configurada:', API_URL);
console.log('[AXIOS] Base URL completa:', `${API_URL}/api`);

const api = axios.create({
  baseURL: `${API_URL}/api`,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Interceptor para agregar el token a cada petición
api.interceptors.request.use(
  (config) => {
    const token = document.cookie
      .split('; ')
      .find(row => row.startsWith('userToken='))
      ?.split('=')[1];
    
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor para manejar errores de respuesta
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('[AXIOS] Error en respuesta:', {
      url: error.config?.url,
      method: error.config?.method,
      status: error.response?.status,
      message: error.response?.data?.message || error.message
    });
    
    // Solo redirigir al login si es un error de autenticación Y no es una ruta pública
    const publicRoutes = ['/firmas/firmar', '/firmas/rechazar', '/documentos/token/', '/documentos/descargar/'];
    const isPublicRoute = publicRoutes.some(route => error.config?.url?.includes(route));
    
    if ((error.response?.status === 401 || error.response?.status === 403) && !isPublicRoute) {
      console.log('[AXIOS] Redirigiendo al login por error de autenticación');
      // Token expirado o inválido - redirigir al login
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
