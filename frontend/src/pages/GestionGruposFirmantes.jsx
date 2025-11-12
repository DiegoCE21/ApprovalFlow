import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Alert, CircularProgress, Chip, TextField, Dialog, DialogTitle,
  DialogContent, DialogActions, FormControl, InputLabel, Select, MenuItem,
  IconButton, Grid, Card, CardContent, Divider, Autocomplete
} from '@mui/material';
import {
  ArrowBack, People, Add, Edit, Delete, Group, Email,
  Person, Work, Badge, AccountCircle
} from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const GestionGruposFirmantes = () => {
  const navigate = useNavigate();
  const [grupos, setGrupos] = useState([]);
  const [grupoSeleccionado, setGrupoSeleccionado] = useState(null);
  const [miembros, setMiembros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cargandoMiembros, setCargandoMiembros] = useState(false);
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [dialogoEditar, setDialogoEditar] = useState(false);
  const [miembroEditando, setMiembroEditando] = useState(null);
  const [usuarios, setUsuarios] = useState([]);

  // Formulario
  const [formData, setFormData] = useState({
    correoGrupo: '',
    miembroNombre: '',
    miembroCorreo: '',
    miembroNumeroNomina: '',
    miembroPuesto: '',
    miembroRol: '',
    miembroUsuarioId: ''
  });

  useEffect(() => {
    cargarGrupos();
    cargarUsuarios();
  }, []);

  const cargarGrupos = async () => {
    try {
      const response = await api.get('/grupos');
      setGrupos(response.data.grupos || []);
    } catch (error) {
      console.error('Error al cargar grupos:', error);
      toast.error('Error al cargar los grupos');
    } finally {
      setLoading(false);
    }
  };

  const cargarUsuarios = async () => {
    try {
      const response = await api.get('/usuarios/personal');
      setUsuarios(response.data.usuarios || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
    }
  };

  const cargarMiembros = async (correoGrupo) => {
    if (!correoGrupo) return;
    
    setCargandoMiembros(true);
    try {
      const response = await api.get(`/grupos/miembros?correo=${encodeURIComponent(correoGrupo)}`);
      setMiembros(response.data.miembros || []);
      setGrupoSeleccionado(correoGrupo);
    } catch (error) {
      console.error('Error al cargar miembros:', error);
      toast.error('Error al cargar los miembros del grupo');
      setMiembros([]);
    } finally {
      setCargandoMiembros(false);
    }
  };

  const handleSeleccionarGrupo = (correoGrupo) => {
    cargarMiembros(correoGrupo);
  };

  const handleAbrirDialogoNuevo = () => {
    if (!grupoSeleccionado) {
      toast.warning('Selecciona un grupo primero');
      return;
    }
    setFormData({
      correoGrupo: grupoSeleccionado,
      miembroNombre: '',
      miembroCorreo: '',
      miembroNumeroNomina: '',
      miembroPuesto: '',
      miembroRol: '',
      miembroUsuarioId: ''
    });
    setDialogoAbierto(true);
  };

  const handleAbrirDialogoEditar = (miembro) => {
    setMiembroEditando(miembro);
    setFormData({
      correoGrupo: miembro.correoGrupo,
      miembroNombre: miembro.nombre,
      miembroCorreo: miembro.correo,
      miembroNumeroNomina: miembro.numeroNomina || '',
      miembroPuesto: miembro.puesto || '',
      miembroRol: miembro.rol || '',
      miembroUsuarioId: miembro.usuarioId > 0 ? miembro.usuarioId : ''
    });
    setDialogoEditar(true);
  };

  const handleCerrarDialogo = () => {
    setDialogoAbierto(false);
    setDialogoEditar(false);
    setMiembroEditando(null);
    setFormData({
      correoGrupo: grupoSeleccionado || '',
      miembroNombre: '',
      miembroCorreo: '',
      miembroNumeroNomina: '',
      miembroPuesto: '',
      miembroRol: '',
      miembroUsuarioId: ''
    });
  };

  const handleGuardar = async () => {
    if (!formData.miembroNombre) {
      toast.error('El nombre es requerido');
      return;
    }

    try {
      if (dialogoEditar && miembroEditando) {
        // Actualizar
        await api.put(`/grupos/miembros/${miembroEditando.registroId}`, formData);
        toast.success('Miembro actualizado exitosamente');
      } else {
        // Crear
        await api.post('/grupos/miembros', formData);
        toast.success('Miembro agregado exitosamente');
      }
      
      handleCerrarDialogo();
      if (grupoSeleccionado) {
        cargarMiembros(grupoSeleccionado);
      }
      cargarGrupos(); // Actualizar conteo
    } catch (error) {
      console.error('Error al guardar miembro:', error);
      toast.error(error.response?.data?.message || 'Error al guardar el miembro');
    }
  };

  const handleEliminar = async (miembro) => {
    if (!window.confirm(`¿Estás seguro de eliminar a ${miembro.nombre} del grupo?`)) {
      return;
    }

    try {
      await api.delete(`/grupos/miembros/${miembro.registroId}`);
      toast.success('Miembro eliminado exitosamente');
      if (grupoSeleccionado) {
        cargarMiembros(grupoSeleccionado);
      }
      cargarGrupos(); // Actualizar conteo
    } catch (error) {
      console.error('Error al eliminar miembro:', error);
      toast.error('Error al eliminar el miembro');
    }
  };

  const handleSeleccionarUsuario = (usuario) => {
    if (!usuario) {
      setFormData(prev => ({ ...prev, miembroUsuarioId: '', miembroNumeroNomina: '' }));
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      miembroUsuarioId: usuario.NumeroNomina, // Usar NumeroNomina como identificador
      miembroNombre: usuario.nombre,
      miembroCorreo: '', // No se llena automáticamente desde personal
      miembroNumeroNomina: usuario.NumeroNomina || '',
      miembroPuesto: '', // No disponible en tabla personal
      miembroRol: '' // No disponible en tabla personal
    }));
  };

  if (loading) {
    return (
      <Container>
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '80vh' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            Gestión de Grupos de Firmantes
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          Gestiona los miembros que pueden firmar en nombre de cada correo grupal. 
          Cuando se seleccione un correo grupal al subir un documento, se podrá elegir entre estos miembros.
        </Alert>

        <Grid container spacing={3}>
          {/* Lista de Grupos */}
          <Grid item xs={12} md={4}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Grupos Disponibles
                  </Typography>
                  <Group color="primary" />
                </Box>
                <Divider sx={{ mb: 2 }} />
                
                {grupos.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No hay grupos configurados
                  </Typography>
                ) : (
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {grupos.map((grupo) => (
                      <Paper
                        key={grupo.correo}
                        sx={{
                          p: 2,
                          cursor: 'pointer',
                          border: grupoSeleccionado === grupo.correo ? 2 : 1,
                          borderColor: grupoSeleccionado === grupo.correo ? 'primary.main' : 'divider',
                          bgcolor: grupoSeleccionado === grupo.correo ? 'action.selected' : 'background.paper',
                          '&:hover': {
                            bgcolor: 'action.hover'
                          }
                        }}
                        onClick={() => handleSeleccionarGrupo(grupo.correo)}
                      >
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                          <Box sx={{ flexGrow: 1 }}>
                            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                              {grupo.correo.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {grupo.correo}
                            </Typography>
                          </Box>
                          <Chip 
                            label={grupo.miembrosRegistrados} 
                            size="small" 
                            color="primary"
                            variant="outlined"
                          />
                        </Box>
                      </Paper>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Miembros del Grupo Seleccionado */}
          <Grid item xs={12} md={8}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Box>
                    <Typography variant="h6">
                      Miembros del Grupo
                    </Typography>
                    {grupoSeleccionado && (
                      <Typography variant="caption" color="text.secondary">
                        {grupoSeleccionado}
                      </Typography>
                    )}
                  </Box>
                  {grupoSeleccionado && (
                    <Button
                      variant="contained"
                      startIcon={<Add />}
                      onClick={handleAbrirDialogoNuevo}
                    >
                      Agregar Miembro
                    </Button>
                  )}
                </Box>
                <Divider sx={{ mb: 2 }} />

                {!grupoSeleccionado ? (
                  <Alert severity="info">
                    Selecciona un grupo para ver sus miembros
                  </Alert>
                ) : cargandoMiembros ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                  </Box>
                ) : miembros.length === 0 ? (
                  <Alert severity="warning">
                    Este grupo no tiene miembros registrados. Agrega el primer miembro.
                  </Alert>
                ) : (
                  <TableContainer>
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableCell><strong>Nombre</strong></TableCell>
                          <TableCell><strong>Correo</strong></TableCell>
                          <TableCell><strong>Puesto</strong></TableCell>
                          <TableCell><strong>Rol</strong></TableCell>
                          <TableCell><strong>Nómina</strong></TableCell>
                          <TableCell align="right"><strong>Acciones</strong></TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {miembros.map((miembro) => (
                          <TableRow key={miembro.registroId}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Person fontSize="small" color="action" />
                                {miembro.nombre}
                              </Box>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Email fontSize="small" color="action" />
                                {miembro.correo}
                              </Box>
                            </TableCell>
                            <TableCell>{miembro.puesto || '-'}</TableCell>
                            <TableCell>{miembro.rol || '-'}</TableCell>
                            <TableCell>{miembro.numeroNomina || '-'}</TableCell>
                            <TableCell align="right">
                              <IconButton
                                size="small"
                                color="primary"
                                onClick={() => handleAbrirDialogoEditar(miembro)}
                              >
                                <Edit fontSize="small" />
                              </IconButton>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleEliminar(miembro)}
                              >
                                <Delete fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Dialogo para Agregar/Editar Miembro */}
        <Dialog open={dialogoAbierto || dialogoEditar} onClose={handleCerrarDialogo} maxWidth="sm" fullWidth>
          <DialogTitle>
            {dialogoEditar ? 'Editar Miembro del Grupo' : 'Agregar Miembro al Grupo'}
          </DialogTitle>
          <DialogContent>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
              <Autocomplete
                fullWidth
                options={usuarios}
                getOptionLabel={(option) => {
                  if (!option || !option.NumeroNomina) return '';
                  return `${option.nombre}${option.NumeroNomina ? ` - ${option.NumeroNomina}` : ''}`;
                }}
                value={usuarios.find(u => u.NumeroNomina === formData.miembroUsuarioId) || null}
                onChange={(event, newValue) => handleSeleccionarUsuario(newValue)}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Buscar Usuario (Opcional)"
                    placeholder="Escribe para buscar..."
                  />
                )}
                filterOptions={(options, { inputValue }) => {
                  return options.filter((option) => {
                    const searchText = inputValue.toLowerCase();
                    const nombre = (option.nombre || '').toLowerCase();
                    const numeroNomina = (option.NumeroNomina || '').toString().toLowerCase();
                    return nombre.includes(searchText) || numeroNomina.includes(searchText);
                  });
                }}
                isOptionEqualToValue={(option, value) => 
                  option.NumeroNomina === value?.NumeroNomina
                }
                noOptionsText="No se encontraron usuarios"
              />

              <TextField
                fullWidth
                required
                label="Nombre Completo"
                value={formData.miembroNombre}
                onChange={(e) => setFormData(prev => ({ ...prev, miembroNombre: e.target.value }))}
              />

              <TextField
                fullWidth
                label="Correo Electrónico (Opcional)"
                type="email"
                value={formData.miembroCorreo}
                onChange={(e) => setFormData(prev => ({ ...prev, miembroCorreo: e.target.value }))}
              />

              <TextField
                fullWidth
                label="Número de Nómina"
                value={formData.miembroNumeroNomina}
                onChange={(e) => setFormData(prev => ({ ...prev, miembroNumeroNomina: e.target.value }))}
              />

              <TextField
                fullWidth
                label="Puesto"
                value={formData.miembroPuesto}
                onChange={(e) => setFormData(prev => ({ ...prev, miembroPuesto: e.target.value }))}
              />

              <TextField
                fullWidth
                label="Rol"
                value={formData.miembroRol}
                onChange={(e) => setFormData(prev => ({ ...prev, miembroRol: e.target.value }))}
              />
            </Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCerrarDialogo}>Cancelar</Button>
            <Button onClick={handleGuardar} variant="contained">
              {dialogoEditar ? 'Actualizar' : 'Agregar'}
            </Button>
          </DialogActions>
        </Dialog>
      </Container>
    </>
  );
};

export default GestionGruposFirmantes;



