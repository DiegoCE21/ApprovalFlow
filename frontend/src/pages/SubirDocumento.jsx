import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, TextField, Paper, AppBar, Toolbar,
  FormControl, InputLabel, Select, MenuItem, Chip, OutlinedInput,
  Grid, CircularProgress, Alert, FormHelperText
} from '@mui/material';
import { ArrowBack, CloudUpload, Description } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const CORREOS_GRUPALES = new Set([
  'supervisores.extrusion@fastprobags.com',
  'calidad.extrusion@fastprobags.com',
  'supervisores.acabado@fastprobags.com',
  'almacenistas.mth@fastprobags.com',
  'embarques.sitio1@fastprobags.com',
  'supervisores.sulzer@fastprobags.com',
  'produccion.general@fastprobags.com',
  'vigilancia.sitio1@fastprobags.com'
]);

const esCorreoGrupal = (correo = '') => CORREOS_GRUPALES.has(correo.toLowerCase());

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
  const [grupoDatos, setGrupoDatos] = useState({});
  const [miembrosGrupoCache, setMiembrosGrupoCache] = useState({});

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

  const normalizarMiembroGrupo = (miembro = {}) => {
    const registroId = (miembro.registroId ?? miembro.registro_id ?? miembro.id)?.toString();
    const preferidoId = miembro.usuarioId ?? miembro.usuario_id ?? miembro.miembro_usuario_id ?? miembro.id;
    let usuarioId = Number(preferidoId);

    if (Number.isNaN(usuarioId)) {
      const parsedRegistro = Number(registroId);
      usuarioId = Number.isNaN(parsedRegistro) ? null : parsedRegistro;
    }

    if (usuarioId === null || Number.isNaN(usuarioId)) {
      usuarioId = -Math.floor(Math.random() * 1_000_000);
    }

    return {
      registroId,
      usuarioId,
      nombre: miembro.nombre ?? miembro.miembro_nombre ?? '',
      correo: miembro.correo ?? miembro.miembro_correo ?? '',
      numeroNomina: miembro.numeroNomina ?? miembro.miembro_numero_nomina ?? '',
      puesto: miembro.puesto ?? miembro.miembro_puesto ?? '',
      rol: miembro.rol ?? miembro.miembro_rol ?? '',
      correoGrupo: miembro.correoGrupo ?? miembro.correo_grupo ?? ''
    };
  };

  const cargarMiembrosGrupo = async (usuarioGrupo) => {
    if (!usuarioGrupo?.id || !usuarioGrupo?.correo) {
      return;
    }

    const grupoId = usuarioGrupo.id.toString();
    const correoGrupo = usuarioGrupo.correo.toLowerCase();

    setGrupoDatos((prev) => ({
      ...prev,
      [grupoId]: {
        usuario: usuarioGrupo,
        miembros: prev[grupoId]?.miembros || [],
        seleccionado: prev[grupoId]?.seleccionado || '',
        seleccionadoDatos: prev[grupoId]?.seleccionadoDatos || null,
        loading: true,
        error: null
      }
    }));

    try {
      let miembros = miembrosGrupoCache[correoGrupo];

      if (!miembros) {
        const response = await api.get('/grupos/miembros', {
          params: { correo: correoGrupo }
        });
        const miembrosApi = response.data?.miembros || [];
        miembros = miembrosApi.map(normalizarMiembroGrupo);

        setMiembrosGrupoCache((prev) => ({
          ...prev,
          [correoGrupo]: miembros
        }));
      }

      if (!miembros || miembros.length === 0) {
        toast.error(`No hay firmantes configurados para el grupo ${usuarioGrupo.nombre || usuarioGrupo.correo}`);
        setAprobadoresSeleccionados((prev) => prev.filter((id) => id !== grupoId));
        setGrupoDatos((prev) => {
          const actualizado = { ...prev };
          delete actualizado[grupoId];
          return actualizado;
        });
        return;
      }

      setGrupoDatos((prev) => {
        const anterior = prev[grupoId];
        const seleccionadoExistente = anterior?.seleccionado;
        const seleccionValida = miembros.find((m) => m.registroId === seleccionadoExistente);

        const seleccionado = seleccionValida
          ? seleccionadoExistente
          : (miembros.length === 1 ? miembros[0].registroId : '');

        const seleccionadoDatos = miembros.find((m) => m.registroId === seleccionado) || null;

        return {
          ...prev,
          [grupoId]: {
            usuario: usuarioGrupo,
            miembros,
            seleccionado,
            seleccionadoDatos,
            loading: false,
            error: null
          }
        };
      });

      if (miembros.length === 1) {
        toast.info(`Se seleccionó automáticamente a ${miembros[0].nombre} para el grupo ${usuarioGrupo.nombre || usuarioGrupo.correo}`);
      }
    } catch (error) {
      console.error('Error al cargar miembros del grupo:', error);
      toast.error(`Error al cargar los firmantes del grupo ${usuarioGrupo.nombre || usuarioGrupo.correo}`);
      setAprobadoresSeleccionados((prev) => prev.filter((id) => id !== grupoId));
      setGrupoDatos((prev) => {
        const actualizado = { ...prev };
        delete actualizado[grupoId];
        return actualizado;
      });
    }
  };

  const handleSeleccionGrupo = (grupoId, registroId) => {
    setGrupoDatos((prev) => {
      const data = prev[grupoId];
      if (!data) return prev;
      const miembro = data.miembros.find((m) => m.registroId === registroId) || null;

      return {
        ...prev,
        [grupoId]: {
          ...data,
          seleccionado: registroId,
          seleccionadoDatos: miembro
        }
      };
    });
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
    const seleccion = typeof value === 'string' ? value.split(',') : value;
    const seleccionNormalizada = seleccion.map((id) => id.toString());
    const seleccionAnterior = aprobadoresSeleccionados;

    const agregados = seleccionNormalizada.filter((id) => !seleccionAnterior.includes(id));
    const removidos = seleccionAnterior.filter((id) => !seleccionNormalizada.includes(id));

    if (removidos.length > 0) {
      setGrupoDatos((prev) => {
        const actualizado = { ...prev };
        removidos.forEach((id) => {
          delete actualizado[id];
        });
        return actualizado;
      });
    }

    setAprobadoresSeleccionados(seleccionNormalizada);

    agregados.forEach((id) => {
      const usuario = usuarios.find((u) => u.id.toString() === id);
      if (usuario && esCorreoGrupal(usuario.correo)) {
        cargarMiembrosGrupo(usuario);
      }
    });
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

    const aprobadoresData = [];

    for (const id of aprobadoresSeleccionados) {
      const usuario = usuarios.find((u) => u.id.toString() === id);

      if (!usuario) {
        toast.error('No se encontró información del aprobador seleccionado.');
        return;
      }

      if (esCorreoGrupal(usuario.correo)) {
        // Para grupos, solo guardamos el correo del grupo, no el miembro específico
        // El miembro se seleccionará al momento de firmar
        aprobadoresData.push({
          id: usuario.id,
          usuarioId: usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          rol: usuario.rolNom || usuario.rol || 'aprobador',
          correoGrupo: usuario.correo,
          grupoMiembroId: null // Se seleccionará al firmar
        });
      } else {
        const usuarioId = Number(usuario.id);
        const idNumerico = Number.isNaN(usuarioId) ? null : usuarioId;

        aprobadoresData.push({
          id: idNumerico ?? usuario.id,
          usuarioId: idNumerico ?? usuario.id,
          nombre: usuario.nombre,
          correo: usuario.correo,
          rol: usuario.rolNom || usuario.rol || 'aprobador',
          correoGrupo: null,
          grupoMiembroId: null
        });
      }
    }

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
                          const usuario = usuarios.find((u) => u.id.toString() === id);
                          const esGrupo = usuario && esCorreoGrupal(usuario.correo);
                          const datosGrupo = esGrupo ? grupoDatos[id] : null;
                          const label = esGrupo
                            ? `${usuario?.nombre || usuario?.correo} → ${datosGrupo?.seleccionadoDatos?.nombre || 'Selecciona persona'}`
                            : (usuario?.nombre || id);
                          const chipColor = esGrupo
                            ? (datosGrupo?.seleccionadoDatos ? 'primary' : 'warning')
                            : 'primary';

                          return (
                            <Chip
                              key={id}
                              label={label}
                              size="small"
                              color={chipColor}
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
                      usuarios.map((usuario) => {
                        const esGrupo = esCorreoGrupal(usuario.correo);
                        return (
                          <MenuItem key={usuario.id} value={usuario.id.toString()}>
                            <Box>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body1">{usuario.nombre}</Typography>
                                {esGrupo && <Chip label="Grupo" size="small" color="info" />}
                              </Box>
                              <Typography variant="caption" color="text.secondary">
                                {usuario.correo}
                              </Typography>
                            </Box>
                          </MenuItem>
                        );
                      })
                    )}
                  </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                  Selecciona todos los usuarios que deben aprobar y firmar este documento.
                  {aprobadoresSeleccionados.some((id) => {
                    const usuario = usuarios.find((u) => u.id.toString() === id);
                    return usuario && esCorreoGrupal(usuario.correo);
                  }) && ' En la sección siguiente podrás elegir quién firmará por cada correo grupal.'}
                </Typography>
              </Grid>

              {aprobadoresSeleccionados.some((id) => {
                const usuario = usuarios.find((u) => u.id.toString() === id);
                return usuario && esCorreoGrupal(usuario.correo);
              }) && (
                <Grid item xs={12}>
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Nota:</strong> Para los correos grupales seleccionados, la persona que firmará se seleccionará al momento de la firma del documento.
                    </Typography>
                  </Alert>
                </Grid>
              )}

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

