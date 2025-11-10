import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Switch, Alert, CircularProgress, Chip, TextField, InputAdornment,
  Card, CardContent, Grid
} from '@mui/material';
import {
  ArrowBack, Security, Check, Close, Search, People,
  AdminPanelSettings, VerifiedUser
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const GestionPermisos = () => {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [cambiosPendientes, setCambiosPendientes] = useState(new Set());

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    try {
      const response = await api.get('/permisos/usuarios');
      setUsuarios(response.data.usuarios || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      if (error.response?.status === 403) {
        toast.error('No tienes permisos para acceder a esta sección');
        navigate('/dashboard');
      } else {
        toast.error('Error al cargar usuarios');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePermiso = (usuarioId) => {
    setUsuarios(usuarios.map(u => 
      u.id === usuarioId 
        ? { ...u, puede_subir_documentos: !u.puede_subir_documentos }
        : u
    ));
    
    // Marcar como cambio pendiente
    const nuevosCambios = new Set(cambiosPendientes);
    nuevosCambios.add(usuarioId);
    setCambiosPendientes(nuevosCambios);
  };

  const handleGuardarCambios = async () => {
    if (cambiosPendientes.size === 0) {
      toast.info('No hay cambios para guardar');
      return;
    }

    setGuardando(true);
    let exitosos = 0;
    let fallidos = 0;

    try {
      for (const usuarioId of cambiosPendientes) {
        const usuario = usuarios.find(u => u.id === usuarioId);
        if (!usuario) continue;

        try {
          await api.put(`/permisos/usuarios/${usuarioId}`, {
            puedeSubirDocumentos: usuario.puede_subir_documentos
          });
          exitosos++;
        } catch (error) {
          console.error(`Error al actualizar usuario ${usuarioId}:`, error);
          fallidos++;
        }
      }

      if (exitosos > 0) {
        toast.success(`${exitosos} permiso(s) actualizado(s) exitosamente`);
        setCambiosPendientes(new Set());
      }
      
      if (fallidos > 0) {
        toast.warning(`${fallidos} permiso(s) no pudieron actualizarse`);
      }

      // Recargar lista
      await cargarUsuarios();

    } catch (error) {
      console.error('Error al guardar cambios:', error);
      toast.error('Error al guardar cambios');
    } finally {
      setGuardando(false);
    }
  };

  const handleCancelarCambios = () => {
    cargarUsuarios();
    setCambiosPendientes(new Set());
    toast.info('Cambios cancelados');
  };

  const usuariosFiltrados = usuarios.filter(u => 
    u.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.correo?.toLowerCase().includes(busqueda.toLowerCase()) ||
    u.NumeroNomina?.toString().includes(busqueda)
  );

  const estadisticas = {
    total: usuarios.length,
    conPermiso: usuarios.filter(u => u.puede_subir_documentos).length,
    sinPermiso: usuarios.filter(u => !u.puede_subir_documentos).length
  };

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <>
      <AppBar position="static" sx={{ bgcolor: 'primary.main' }}>
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
          <AdminPanelSettings sx={{ ml: 2, mr: 1 }} />
          <Box>
            <Typography variant="h6">
              Gestión de Permisos
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Administración de permisos para subir documentos
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>Administrador:</strong> Solo tú puedes otorgar o revocar permisos para subir documentos.
          Los usuarios sin permiso no podrán acceder a la opción de "Subir Documento".
        </Alert>

        {/* Estadísticas */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <People sx={{ fontSize: 40, color: 'primary.main' }} />
                  <Box>
                    <Typography variant="h4">{estadisticas.total}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Usuarios
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <VerifiedUser sx={{ fontSize: 40, color: 'success.main' }} />
                  <Box>
                    <Typography variant="h4">{estadisticas.conPermiso}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Con Permiso
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Security sx={{ fontSize: 40, color: 'error.main' }} />
                  <Box>
                    <Typography variant="h4">{estadisticas.sinPermiso}</Typography>
                    <Typography variant="body2" color="text.secondary">
                      Sin Permiso
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        <Paper sx={{ p: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
            <Typography variant="h5">
              Lista de Usuarios
            </Typography>
            {cambiosPendientes.size > 0 && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button
                  variant="outlined"
                  color="inherit"
                  onClick={handleCancelarCambios}
                  disabled={guardando}
                >
                  Cancelar
                </Button>
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleGuardarCambios}
                  disabled={guardando}
                  startIcon={guardando ? <CircularProgress size={20} /> : <Check />}
                >
                  Guardar Cambios ({cambiosPendientes.size})
                </Button>
              </Box>
            )}
          </Box>

          {/* Buscador */}
          <TextField
            fullWidth
            placeholder="Buscar por nombre, correo o nómina..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            sx={{ mb: 3 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Search />
                </InputAdornment>
              ),
            }}
          />

          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Nombre</strong></TableCell>
                  <TableCell><strong>Correo</strong></TableCell>
                  <TableCell><strong>Nómina</strong></TableCell>
                  <TableCell><strong>Tipo</strong></TableCell>
                  <TableCell align="center"><strong>Permiso</strong></TableCell>
                  <TableCell align="center"><strong>Estado</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {usuariosFiltrados.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      <Typography color="text.secondary">
                        No se encontraron usuarios
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  usuariosFiltrados.map((usuario) => (
                    <TableRow 
                      key={usuario.id}
                      sx={{ 
                        bgcolor: cambiosPendientes.has(usuario.id) ? 'action.hover' : 'inherit',
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <TableCell>{usuario.nombre}</TableCell>
                      <TableCell>
                        {usuario.correo}
                        {usuario.correo === 'diego.castillo@fastprobags.com' && (
                          <Chip 
                            label="Admin" 
                            size="small" 
                            color="primary" 
                            sx={{ ml: 1 }} 
                          />
                        )}
                      </TableCell>
                      <TableCell>{usuario.NumeroNomina || '—'}</TableCell>
                      <TableCell>
                        <Chip 
                          label={usuario.TipoUsuario || 'N/A'} 
                          size="small" 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Switch
                          checked={usuario.puede_subir_documentos}
                          onChange={() => handleTogglePermiso(usuario.id)}
                          color="success"
                          disabled={guardando}
                        />
                      </TableCell>
                      <TableCell align="center">
                        {usuario.puede_subir_documentos ? (
                          <Chip
                            icon={<Check />}
                            label="Autorizado"
                            color="success"
                            size="small"
                          />
                        ) : (
                          <Chip
                            icon={<Close />}
                            label="Sin permiso"
                            color="default"
                            size="small"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>

          {usuariosFiltrados.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Mostrando {usuariosFiltrados.length} de {usuarios.length} usuarios
            </Typography>
          )}
        </Paper>
      </Container>
    </>
  );
};

export default GestionPermisos;
