import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, TextField, Paper, AppBar, Toolbar,
  FormControl, InputLabel, Select, MenuItem, Chip, OutlinedInput,
  Grid, CircularProgress, Alert
} from '@mui/material';
import { ArrowBack, CloudUpload, Description } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const SubirDocumento = () => {
  const navigate = useNavigate();
  const [archivo, setArchivo] = useState(null);
  const [tipoDocumento, setTipoDocumento] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [usuarios, setUsuarios] = useState([]);
  const [aprobadoresSeleccionados, setAprobadoresSeleccionados] = useState([]);
  const [tiempoLimite, setTiempoLimite] = useState('');
  const [intervaloRecordatorio, setIntervaloRecordatorio] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingUsuarios, setLoadingUsuarios] = useState(true);

  useEffect(() => {
    cargarUsuarios();
  }, []);

  const cargarUsuarios = async () => {
    try {
      // Endpoint para obtener usuarios de SQL Server
      const response = await api.get('/usuarios/lista');
      setUsuarios(response.data.usuarios || []);
    } catch (error) {
      console.error('Error al cargar usuarios:', error);
      toast.error('Error al cargar la lista de usuarios');
      // Lista de usuarios de ejemplo en caso de error
      setUsuarios([
        { id: 1, nombre: 'Diego Castillo', correo: 'diego.castillo@fastprobags.com' },
        { id: 2, nombre: 'Usuario Ejemplo', correo: 'usuario@empresa.com' }
      ]);
    } finally {
      setLoadingUsuarios(false);
    }
  };

  const handleArchivoChange = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf') {
        toast.error('Solo se permiten archivos PDF');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error('El archivo no debe superar los 10 MB');
        return;
      }
      setArchivo(file);
    }
  };

  const handleAprobadoresChange = (event) => {
    const value = event.target.value;
    setAprobadoresSeleccionados(typeof value === 'string' ? value.split(',') : value);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!archivo) {
      toast.error('Debes seleccionar un archivo PDF');
      return;
    }

    if (aprobadoresSeleccionados.length === 0) {
      toast.error('Debes seleccionar al menos un aprobador');
      return;
    }

    if (!descripcion.trim()) {
      toast.error('Debes agregar una descripción');
      return;
    }

    // Obtener información completa de los aprobadores seleccionados
    const aprobadoresData = usuarios
      .filter(u => aprobadoresSeleccionados.includes(u.id.toString()))
      .map(u => ({
        id: u.id,
        nombre: u.nombre,
        correo: u.correo,
        rol: 'aprobador'
      }));

    // Navegar a la pantalla de definir posiciones
    navigate('/definir-posiciones', {
      state: {
        archivo,
        tipoDocumento,
        descripcion,
        aprobadores: aprobadoresData,
        tiempoLimiteHoras: tiempoLimite ? parseInt(tiempoLimite) : null,
        intervaloRecordatorioMinutos: intervaloRecordatorio ? parseInt(intervaloRecordatorio) : null
      }
    });
  };

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBack />} onClick={() => navigate('/dashboard')}>
            Volver
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            Subir Documento
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Description sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
            <Typography variant="h4">
              Nuevo Documento para Aprobación
            </Typography>
          </Box>

          <Alert severity="info" sx={{ mb: 3 }}>
            Los aprobadores seleccionados recibirán un correo con el enlace para revisar y firmar el documento.
          </Alert>

          <form onSubmit={handleSubmit}>
            <Grid container spacing={3}>
              {/* Selector de archivo */}
              <Grid item xs={12}>
                <Button
                  variant="outlined"
                  component="label"
                  fullWidth
                  startIcon={<CloudUpload />}
                  sx={{ py: 2 }}
                >
                  {archivo ? archivo.name : 'Seleccionar archivo PDF'}
                  <input
                    type="file"
                    hidden
                    accept="application/pdf"
                    onChange={handleArchivoChange}
                  />
                </Button>
                {archivo && (
                  <Typography variant="caption" display="block" sx={{ mt: 1, color: 'success.main' }}>
                    ✓ Archivo seleccionado: {archivo.name} ({(archivo.size / 1024 / 1024).toFixed(2)} MB)
                  </Typography>
                )}
              </Grid>

              {/* Tipo de documento */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Tipo de Documento"
                  value={tipoDocumento}
                  onChange={(e) => setTipoDocumento(e.target.value)}
                  placeholder="Ej: Procedimiento, Manual, Formato"
                />
              </Grid>

              {/* Tiempo límite de aprobación */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Tiempo Límite de Aprobación (horas)"
                  value={tiempoLimite}
                  onChange={(e) => setTiempoLimite(e.target.value)}
                  placeholder="Ej: 4"
                  inputProps={{ min: 1, max: 168 }}
                  helperText="En cuántas horas debe estar aprobado (opcional)"
                />
              </Grid>

              {/* Intervalo de recordatorio */}
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="Frecuencia de Recordatorios (minutos)"
                  value={intervaloRecordatorio}
                  onChange={(e) => setIntervaloRecordatorio(e.target.value)}
                  placeholder="Ej: 20"
                  inputProps={{ min: 5, max: 1440 }}
                  helperText="Cada cuántos minutos enviar recordatorios (opcional)"
                />
              </Grid>

              {/* Descripción */}
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  required
                  multiline
                  rows={4}
                  label="Descripción"
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Describe el contenido del documento y el propósito de las aprobaciones..."
                />
              </Grid>

              {/* Selección de aprobadores */}
              <Grid item xs={12}>
                <FormControl fullWidth required>
                  <InputLabel>Aprobadores</InputLabel>
                  <Select
                    multiple
                    value={aprobadoresSeleccionados}
                    onChange={handleAprobadoresChange}
                    input={<OutlinedInput label="Aprobadores" />}
                    renderValue={(selected) => (
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                        {selected.map((id) => {
                          const usuario = usuarios.find(u => u.id.toString() === id);
                          return (
                            <Chip
                              key={id}
                              label={usuario?.nombre || id}
                              size="small"
                              color="primary"
                            />
                          );
                        })}
                      </Box>
                    )}
                    disabled={loadingUsuarios}
                  >
                    {loadingUsuarios ? (
                      <MenuItem disabled>
                        <CircularProgress size={20} sx={{ mr: 1 }} />
                        Cargando usuarios...
                      </MenuItem>
                    ) : usuarios.length === 0 ? (
                      <MenuItem disabled>No hay usuarios disponibles</MenuItem>
                    ) : (
                      usuarios.map((usuario) => (
                        <MenuItem key={usuario.id} value={usuario.id.toString()}>
                          <Box>
                            <Typography variant="body1">{usuario.nombre}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {usuario.correo}
                            </Typography>
                          </Box>
                        </MenuItem>
                      ))
                    )}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Selecciona todos los usuarios que deben aprobar y firmar este documento
                </Typography>
              </Grid>

              {/* Botones */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                  <Button
                    variant="outlined"
                    onClick={() => navigate('/dashboard')}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    disabled={loading || !archivo || aprobadoresSeleccionados.length === 0}
                    startIcon={loading ? <CircularProgress size={20} /> : <CloudUpload />}
                  >
                    {loading ? 'Subiendo...' : 'Subir Documento'}
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </form>
        </Paper>
      </Container>
    </>
  );
};

export default SubirDocumento;
