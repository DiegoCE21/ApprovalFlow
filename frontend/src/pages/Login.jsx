import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, TextField, Button, Typography, Container, Paper, Alert } from '@mui/material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const Login = () => {
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await api.post('/auth/login', {
        correo,
        password
      });

      if (response.data.success) {
        toast.success('¡Bienvenido!');
        localStorage.setItem('user', JSON.stringify(response.data.user));
        
        // Redirigir a la URL de aprobación si existe, sino al dashboard
        const redirectPath = searchParams.get('redirect');
        navigate(redirectPath || '/dashboard');
      }
    } catch (err) {
      const mensaje = err.response?.data?.message || 'Error al iniciar sesión';
      setError(mensaje);
      toast.error(mensaje);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper elevation={3} sx={{ p: 4, width: '100%' }}>
          <Typography component="h1" variant="h4" align="center" gutterBottom>
            Sistema de Aprobaciones
          </Typography>
          <Typography variant="subtitle1" align="center" color="text.secondary" sx={{ mb: 3 }}>
            Firmas Digitales
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} noValidate>
            <TextField
              margin="normal"
              required
              fullWidth
              id="correo"
              label="Correo Electrónico"
              name="correo"
              autoComplete="email"
              autoFocus
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="password"
              label="Contraseña"
              type="password"
              id="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;
