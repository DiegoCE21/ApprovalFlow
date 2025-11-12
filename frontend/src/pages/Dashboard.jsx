import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Tabs, Tab, Button, AppBar, Toolbar,
  Card, CardContent, Chip, Grid, Badge, LinearProgress, Divider, Avatar,
  TextField, InputAdornment, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { 
  Add, Description, PendingActions, Logout, CloudUpload, 
  CheckCircle, Schedule, Cancel, Assignment, AdminPanelSettings, Search,
  FilterList, People
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const Dashboard = () => {
  const [tabValue, setTabValue] = useState(0);
  const [misDocumentos, setMisDocumentos] = useState([]);
  const [documentosPendientes, setDocumentosPendientes] = useState([]);
  const [user, setUser] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    cargarDocumentos();
  }, []);

  const cargarDocumentos = async () => {
    try {
      const [misDocsRes, pendientesRes] = await Promise.all([
        api.get('/documentos/mis-documentos'),
        api.get('/documentos/pendientes')
      ]);

      setMisDocumentos(misDocsRes.data.documentos || []);
      setDocumentosPendientes(pendientesRes.data.documentos || []);
    } catch (error) {
      toast.error('Error al cargar documentos');
      console.error(error);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
      localStorage.removeItem('user');
      navigate('/login');
      toast.success('Sesión cerrada');
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const getEstadoColor = (estado) => {
    const colores = {
      'pendiente': 'warning',
      'aprobado': 'success',
      'rechazado': 'error',
      'en_revision': 'info'
    };
    return colores[estado] || 'default';
  };

  const getInitials = (name) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  // Filtrar documentos
  const documentosFiltrados = misDocumentos.filter(doc => {
    const coincideBusqueda = doc.nombre_archivo.toLowerCase().includes(busqueda.toLowerCase()) ||
                             (doc.descripcion || '').toLowerCase().includes(busqueda.toLowerCase());
    const coincideEstado = filtroEstado === 'todos' || doc.estado === filtroEstado;
    return coincideBusqueda && coincideEstado;
  });

  return (
    <>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.main' }}>
        <Toolbar sx={{ py: 1 }}>
          <Assignment sx={{ mr: 2, fontSize: 32 }} />
          <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 600, letterSpacing: '-0.01em' }}>
              Sistema de Gestión Documental
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Aprobaciones y Firmas Digitales
            </Typography>
          </Box>
          <Box sx={{ flexGrow: 1 }} />
          <Badge 
            badgeContent={documentosPendientes.length} 
            color="error"
            sx={{ mr: 3 }}
          >
            <PendingActions />
          </Badge>
          <Avatar 
            sx={{ 
              bgcolor: 'primary.dark', 
              mr: 2,
              width: 36,
              height: 36,
              fontSize: '0.875rem'
            }}
          >
            {getInitials(user?.nombre)}
          </Avatar>
          <Box sx={{ mr: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {user?.nombre}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              {user?.correo}
            </Typography>
          </Box>
          <Button 
            color="inherit" 
            onClick={handleLogout} 
            startIcon={<Logout />}
            sx={{ 
              ml: 2,
              borderLeft: '1px solid rgba(255,255,255,0.2)',
              borderRadius: 0,
              '&:hover': {
                bgcolor: 'primary.dark'
              }
            }}
          >
            Cerrar Sesión
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 80px)' }}>
        <Container maxWidth="xl" sx={{ pt: 4, pb: 6 }}>
          {/* Header Section */}
          <Box sx={{ mb: 4 }}>
            <Grid container spacing={3} alignItems="center">
              <Grid item xs={12} md={8}>
                <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary', mb: 1 }}>
                  Panel de Control
                </Typography>
                <Typography variant="body1" color="text.secondary">
                  Gestiona tus documentos y aprobaciones pendientes
                </Typography>
              </Grid>
              <Grid item xs={12} md={4} sx={{ textAlign: { xs: 'left', md: 'right' }, display: 'flex', gap: 2, justifyContent: { xs: 'flex-start', md: 'flex-end' } }}>
                {/* Botón de Gestión de Permisos (solo para Diego) */}
                {user?.correo === 'diego.castillo@fastprobags.com' && (
                  <>
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<AdminPanelSettings />}
                      onClick={() => navigate('/gestion-permisos')}
                      sx={{ 
                        px: 3,
                        py: 1.5
                      }}
                    >
                      Permisos
                    </Button>
                    <Button
                      variant="outlined"
                      size="large"
                      startIcon={<People />}
                      onClick={() => navigate('/gestion-grupos')}
                      sx={{ 
                        px: 3,
                        py: 1.5
                      }}
                    >
                      Grupos
                    </Button>
                  </>
                )}
                
                {/* Botón de Subir Documento (solo para usuarios con permiso) */}
                {user?.puedeSubirDocumentos && (
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={<CloudUpload />}
                    onClick={() => navigate('/subir-documento')}
                    sx={{ 
                      px: 4,
                      py: 1.5,
                      fontSize: '1rem'
                    }}
                  >
                    Subir Documento
                  </Button>
                )}
              </Grid>
            </Grid>
          </Box>

          {/* Stats Cards */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                        {misDocumentos.length}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        Mis Documentos
                      </Typography>
                    </Box>
                    <Description sx={{ fontSize: 48, opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'warning.main', color: 'white' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                        {documentosPendientes.length}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        Por Aprobar
                      </Typography>
                    </Box>
                    <Schedule sx={{ fontSize: 48, opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'success.main', color: 'white' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                        {misDocumentos.filter(d => d.estado === 'aprobado').length}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        Aprobados
                      </Typography>
                    </Box>
                    <CheckCircle sx={{ fontSize: 48, opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h3" sx={{ fontWeight: 700, mb: 1 }}>
                        {misDocumentos.filter(d => d.estado === 'rechazado').length}
                      </Typography>
                      <Typography variant="body2" sx={{ opacity: 0.9 }}>
                        Rechazados
                      </Typography>
                    </Box>
                    <Cancel sx={{ fontSize: 48, opacity: 0.3 }} />
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {/* Tabs */}
          <Card sx={{ mb: 3 }}>
            <Tabs 
              value={tabValue} 
              onChange={(e, newValue) => setTabValue(newValue)}
              sx={{
                '& .MuiTab-root': {
                  minHeight: 64,
                  fontSize: '1rem',
                  fontWeight: 500
                }
              }}
            >
              <Tab 
                icon={<Description />} 
                label="Mis Documentos" 
                iconPosition="start"
              />
              <Tab 
                icon={<PendingActions />} 
                label="Pendientes de Aprobar" 
                iconPosition="start"
              />
            </Tabs>
          </Card>

          {/* Tab Content - Mis Documentos */}
          {tabValue === 0 && (
            <>
              {/* Barra de Filtros */}
              {misDocumentos.length > 0 && (
                <Card sx={{ mb: 3 }}>
                  <CardContent>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={6}>
                        <TextField
                          fullWidth
                          placeholder="Buscar por nombre o descripción..."
                          value={busqueda}
                          onChange={(e) => setBusqueda(e.target.value)}
                          InputProps={{
                            startAdornment: (
                              <InputAdornment position="start">
                                <Search color="action" />
                              </InputAdornment>
                            ),
                          }}
                          size="small"
                        />
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <FormControl fullWidth size="small">
                          <InputLabel>Estado</InputLabel>
                          <Select
                            value={filtroEstado}
                            label="Estado"
                            onChange={(e) => setFiltroEstado(e.target.value)}
                          >
                            <MenuItem value="todos">Todos</MenuItem>
                            <MenuItem value="pendiente">Pendiente</MenuItem>
                            <MenuItem value="aprobado">Aprobado</MenuItem>
                            <MenuItem value="rechazado">Rechazado</MenuItem>
                            <MenuItem value="vencido">Vencido</MenuItem>
                          </Select>
                        </FormControl>
                      </Grid>
                      <Grid item xs={12} sm={6} md={3}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <FilterList color="action" />
                          <Typography variant="body2" color="text.secondary">
                            {documentosFiltrados.length} de {misDocumentos.length} documentos
                          </Typography>
                        </Box>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              )}

              <Grid container spacing={2}>
                {documentosFiltrados.length === 0 && misDocumentos.length === 0 ? (
                <Grid item xs={12}>
                  <Card sx={{ py: 6 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Description sx={{ fontSize: 64, color: 'text.secondary', mb: 2, opacity: 0.3 }} />
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        No has subido ningún documento todavía
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        Comienza subiendo tu primer documento al sistema
                      </Typography>
                      {user?.puedeSubirDocumentos && (
                        <Button
                          variant="contained"
                          startIcon={<CloudUpload />}
                          onClick={() => navigate('/subir-documento')}
                        >
                          Subir Documento
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </Grid>
              ) : documentosFiltrados.length === 0 ? (
                <Grid item xs={12}>
                  <Card sx={{ py: 4 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Search sx={{ fontSize: 48, color: 'text.secondary', mb: 2, opacity: 0.3 }} />
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        No se encontraron documentos
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Intenta ajustar los filtros de búsqueda
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => {
                          setBusqueda('');
                          setFiltroEstado('todos');
                        }}
                      >
                        Limpiar Filtros
                      </Button>
                    </CardContent>
                  </Card>
                </Grid>
              ) : (
                documentosFiltrados.map((doc) => (
                  <Grid item xs={12} sm={6} lg={4} key={doc.id}>
                    <Card 
                      sx={{ 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          boxShadow: 4
                        }
                      }}
                      onClick={() => navigate(`/documento/${doc.id}`)}
                    >
                      <CardContent sx={{ p: 2.5, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                        {/* Header con nombre y estado */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1.5 }}>
                          <Typography 
                            variant="subtitle1" 
                            sx={{ 
                              fontWeight: 600, 
                              flexGrow: 1, 
                              mr: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              lineHeight: 1.3
                            }}
                          >
                            {doc.nombre_archivo}
                          </Typography>
                          <Chip
                            label={doc.estado.toUpperCase()}
                            color={getEstadoColor(doc.estado)}
                            size="small"
                            sx={{ fontWeight: 600, fontSize: '0.65rem' }}
                          />
                        </Box>

                        {/* Descripción */}
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          sx={{ 
                            mb: 1.5,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            minHeight: 40
                          }}
                        >
                          {doc.descripcion || 'Sin descripción'}
                        </Typography>

                        {/* Metadata en una fila */}
                        <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                          <Chip 
                            label={`v${doc.version}`} 
                            size="small" 
                            variant="outlined"
                            sx={{ fontSize: '0.7rem' }}
                          />
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center' }}>
                            {new Date(doc.fecha_creacion).toLocaleDateString('es-MX', { 
                              month: 'short', 
                              day: 'numeric' 
                            })}
                          </Typography>
                        </Box>

                        {/* Progreso - más compacto */}
                        <Box sx={{ mt: 'auto' }}>
                          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 500, color: 'text.secondary' }}>
                              Aprobaciones
                            </Typography>
                            <Typography variant="caption" sx={{ fontWeight: 600 }}>
                              {doc.aprobadores_completados}/{doc.total_aprobadores}
                            </Typography>
                          </Box>
                          <LinearProgress 
                            variant="determinate" 
                            value={(doc.aprobadores_completados / doc.total_aprobadores) * 100}
                            sx={{ 
                              height: 6, 
                              borderRadius: 3,
                              bgcolor: 'action.hover'
                            }}
                          />
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))
              )}
              </Grid>
            </>
          )}

          {/* Tab Content - Pendientes de Aprobar */}
          {tabValue === 1 && (
            <Grid container spacing={3}>
              {documentosPendientes.length === 0 ? (
                <Grid item xs={12}>
                  <Card sx={{ py: 6 }}>
                    <CardContent sx={{ textAlign: 'center' }}>
                      <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2, opacity: 0.3 }} />
                      <Typography variant="h6" color="text.secondary" gutterBottom>
                        No tienes documentos pendientes de aprobar
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        ¡Estás al día con todas tus aprobaciones!
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ) : (
                documentosPendientes.map((doc) => (
                  <Grid item xs={12} lg={6} key={doc.id}>
                    <Card 
                      sx={{ 
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        borderLeft: 4,
                        borderColor: 'warning.main',
                        transition: 'transform 0.2s',
                        '&:hover': {
                          transform: 'translateY(-4px)',
                          borderColor: 'warning.dark'
                        }
                      }}
                    >
                      <CardContent sx={{ flexGrow: 1 }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 2 }}>
                          <Box sx={{ flexGrow: 1, mr: 2 }}>
                            <Chip 
                              label="REQUIERE APROBACIÓN" 
                              color="warning" 
                              size="small"
                              icon={<Schedule />}
                              sx={{ fontWeight: 600, fontSize: '0.75rem', mb: 1 }}
                            />
                            <Typography variant="h6" component="div" sx={{ fontWeight: 600 }}>
                              {doc.nombre_archivo}
                            </Typography>
                          </Box>
                        </Box>

                        <Divider sx={{ my: 2 }} />

                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2, minHeight: 40 }}>
                          {doc.descripcion}
                        </Typography>

                        <Grid container spacing={2} sx={{ mb: 3 }}>
                          <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                Creado por:
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {doc.usuario_creador_nombre}
                              </Typography>
                            </Box>
                          </Grid>
                          <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="caption" color="text.secondary">
                                Fecha:
                              </Typography>
                              <Typography variant="body2">
                                {new Date(doc.fecha_creacion).toLocaleDateString('es-MX', { 
                                  year: 'numeric', 
                                  month: 'long', 
                                  day: 'numeric' 
                                })}
                              </Typography>
                            </Box>
                          </Grid>
                        </Grid>

                        <Button
                          variant="contained"
                          color="warning"
                          fullWidth
                          size="large"
                          onClick={() => navigate(`/aprobar/${doc.token_firma}`)}
                          sx={{ fontWeight: 600 }}
                        >
                          Revisar y Firmar Documento
                        </Button>
                      </CardContent>
                    </Card>
                  </Grid>
                ))
              )}
            </Grid>
          )}
        </Container>
      </Box>
    </>
  );
};

export default Dashboard;
