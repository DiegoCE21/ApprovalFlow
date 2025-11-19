import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, Grid, Card, CardContent, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
  DialogContentText
} from '@mui/material';
import { ArrowBack, Download, CheckCircle, Cancel, PendingActions, CloudUpload, Edit, Delete, Send } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { toast } from 'react-toastify';
import api from '../config/axios';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configurar worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

/**
 * Filtra aprobadores duplicados: si un aprobador está pendiente en versiones anteriores
 * y también está pendiente en la versión actual, solo se muestra la versión actual.
 * Las versiones rechazadas y aprobadas siempre se mantienen.
 */
const filtrarAprobadoresDuplicados = (aprobadores, versionActual) => {
  // Agrupar por correo del usuario
  const aprobadoresPorCorreo = {};
  
  aprobadores.forEach(aprobador => {
    const correo = aprobador.usuario_correo;
    if (!aprobadoresPorCorreo[correo]) {
      aprobadoresPorCorreo[correo] = [];
    }
    aprobadoresPorCorreo[correo].push(aprobador);
  });

  const resultado = [];

  // Procesar cada grupo de aprobadores (mismo correo)
  Object.values(aprobadoresPorCorreo).forEach(grupo => {
    // Ordenar por versión descendente
    grupo.sort((a, b) => b.version - a.version);

    // Encontrar la versión actual (más reciente)
    const versionActualAprobador = grupo.find(a => a.version === versionActual);
    const versionesAnteriores = grupo.filter(a => a.version < versionActual);

    // Si hay versión actual pendiente
    if (versionActualAprobador && versionActualAprobador.estado === 'pendiente') {
      // Verificar si hay versiones anteriores pendientes
      const versionesAnterioresPendientes = versionesAnteriores.filter(
        a => a.estado === 'pendiente'
      );

      // Si hay versiones anteriores pendientes, solo mantener la actual
      if (versionesAnterioresPendientes.length > 0) {
        // Agregar versión actual
        resultado.push(versionActualAprobador);
        
        // Agregar versiones anteriores que NO están pendientes (rechazadas o aprobadas)
        versionesAnteriores.forEach(a => {
          if (a.estado !== 'pendiente') {
            resultado.push(a);
          }
        });
      } else {
        // No hay versiones anteriores pendientes, agregar todas
        resultado.push(...grupo);
      }
    } else {
      // No hay versión actual pendiente, agregar todas las versiones
      resultado.push(...grupo);
    }
  });

  return resultado;
};

const VerDocumento = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [documento, setDocumento] = useState(null);
  const [aprobadores, setAprobadores] = useState([]);
  const [firmas, setFirmas] = useState([]);
  const [historialVersiones, setHistorialVersiones] = useState([]);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const [dialogoEditar, setDialogoEditar] = useState(false);
  const [dialogoEliminar, setDialogoEliminar] = useState(false);
  const [formularioEditar, setFormularioEditar] = useState({
    nombre_archivo: '',
    tipo_documento: '',
    descripcion: '',
    tiempo_limite_horas: '',
    intervalo_recordatorio_minutos: ''
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
    cargarDocumento();
  }, [id]);

  const cargarDocumento = async () => {
    try {
      // Obtener información del documento
      const response = await api.get(`/documentos/${id}`);
      const doc = response.data.documento;
      setDocumento(doc);

      // Obtener historial de versiones
      const historialResponse = await api.get(`/documentos/${id}/historial`);
      const versiones = historialResponse.data.versiones || [];
      setHistorialVersiones(versiones);

      // Obtener TODOS los aprobadores de TODAS las versiones
      const todosAprobadores = [];
      for (const version of versiones) {
        const aprobadoresResponse = await api.get(`/documentos/${version.id}/aprobadores`);
        const aprobadoresVersion = aprobadoresResponse.data.aprobadores || [];
        
        // Añadir información de la versión a cada aprobador
        aprobadoresVersion.forEach(aprobador => {
          todosAprobadores.push({
            ...aprobador,
            version: version.version,
            documento_id: version.id
          });
        });
      }

      // Filtrar aprobadores: si está pendiente en versión anterior y también en actual, solo mostrar actual
      const aprobadoresFiltrados = filtrarAprobadoresDuplicados(todosAprobadores, doc.version);
      setAprobadores(aprobadoresFiltrados);

      // Obtener aprobadores solo de la versión actual para el contador
      const aprobadoresActualResponse = await api.get(`/documentos/${id}/aprobadores`);
      const aprobadoresActual = aprobadoresActualResponse.data.aprobadores || [];

      // Obtener firmas
      const firmasResponse = await api.get(`/firmas/${id}`);
      setFirmas(firmasResponse.data.firmas || []);

      // Cargar PDF
      const pdfResponse = await api.get(`/documentos/descargar/${id}`, {
        responseType: 'blob'
      });
      const pdfBlob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);

      setLoading(false);
    } catch (error) {
      console.error('Error al cargar documento:', error);
      toast.error('Error al cargar el documento');
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const puedeEditarEliminar = () => {
    if (!user || !documento) return false;
    const esAdmin = user.correo === 'diego.castillo@fastprobags.com';
    const esCreador = documento.usuario_creador_id === user.id;
    return esAdmin || esCreador;
  };

  const handleDescargar = async () => {
    try {
      const response = await api.get(`/documentos/descargar/${id}`, {
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', documento?.nombre_archivo || 'documento.pdf');
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Documento descargado');
    } catch (error) {
      console.error('Error al descargar:', error);
      toast.error('Error al descargar el documento');
    }
  };

  const handleReenviar = async () => {
    try {
      setLoading(true);
      const response = await api.post(`/documentos/${id}/reenviar`);
      toast.success(response.data.message || 'Documento reenviado exitosamente');
      cargarDocumento(); // Recargar el documento
    } catch (error) {
      console.error('Error al reenviar documento:', error);
      toast.error(error.response?.data?.message || 'Error al reenviar el documento');
    } finally {
      setLoading(false);
    }
  };

  const getEstadoColor = (estado) => {
    const colores = {
      'pendiente': 'warning',
      'aprobado': 'success',
      'rechazado': 'error',
      'vencido': 'error'
    };
    return colores[estado] || 'default';
  };

  const getEstadoIcon = (estado) => {
    const iconos = {
      'pendiente': <PendingActions />,
      'aprobado': <CheckCircle />,
      'rechazado': <Cancel />,
      'vencido': <Cancel />
    };
    return iconos[estado] || null;
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

  if (!documento) {
    return (
      <Container>
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography variant="h5">Documento no encontrado</Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/dashboard')}>
            Volver al Dashboard
          </Button>
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
            Detalles del Documento
          </Typography>
          {user?.correo === 'diego.castillo@fastprobags.com' && (
            <Button 
              color="inherit" 
              startIcon={<Edit />} 
              onClick={() => navigate(`/editar-posiciones-firmas/${id}`)}
              sx={{ mr: 1 }}
            >
              Editar Posiciones de Firmas
            </Button>
          )}
          {puedeEditarEliminar() && (
            <>
              <Button 
                color="inherit" 
                startIcon={<Edit />} 
                onClick={abrirDialogoEditar}
                sx={{ mr: 1 }}
              >
                Editar
              </Button>
              <Button 
                color="inherit" 
                startIcon={<Delete />} 
                onClick={abrirDialogoEliminar}
                sx={{ mr: 1 }}
              >
                Eliminar
              </Button>
            </>
          )}
          <Button color="inherit" startIcon={<Download />} onClick={handleDescargar}>
            Descargar
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        {/* Alerta si el documento fue rechazado */}
        {documento.estado === 'rechazado' && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Este documento ha sido rechazado
            </Typography>
            {aprobadores.filter(a => a.estado === 'rechazado').map((aprobador, idx) => (
              <Box key={idx} sx={{ mt: 1 }}>
                <Typography variant="body2">
                  <strong>{aprobador.usuario_nombre}:</strong> {aprobador.motivo_rechazo}
                </Typography>
              </Box>
            ))}
            {documento.usuario_creador_id === JSON.parse(localStorage.getItem('user') || '{}').id && (
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<CloudUpload />}
                  onClick={() => navigate(`/subir-nueva-version/${id}`)}
                >
                  Subir Nueva Versión
                </Button>
              </Box>
            )}
          </Alert>
        )}

        {/* Alerta si el documento está vencido */}
        {documento.estado === 'vencido' && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Este documento ha vencido
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              El tiempo límite para aprobar este documento ha expirado. Puedes reenviarlo para extender el plazo.
            </Typography>
            {puedeEditarEliminar() && (
              <Box sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<Send />}
                  onClick={handleReenviar}
                  disabled={loading}
                >
                  Reenviar Documento
                </Button>
              </Box>
            )}
          </Alert>
        )}

        <Grid container spacing={3}>
          {/* Información del documento */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h5" gutterBottom>
                  {documento.nombre_archivo}
                </Typography>
                <Box sx={{ mb: 2 }}>
                  <Chip
                    label={documento.estado}
                    color={getEstadoColor(documento.estado)}
                    icon={getEstadoIcon(documento.estado)}
                  />
                </Box>
                <Typography variant="body2" color="text.secondary" paragraph>
                  <strong>Descripción:</strong> {documento.descripcion}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Tipo:</strong> {documento.tipo_documento || 'No especificado'}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Versión:</strong> {documento.version}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Creado por:</strong> {documento.usuario_creador_nombre}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  <strong>Fecha:</strong> {new Date(documento.fecha_creacion).toLocaleString('es-MX')}
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          {/* Progreso de aprobaciones */}
          <Grid item xs={12} md={6}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Progreso de Aprobaciones (Versión Actual)
                </Typography>
                <Typography variant="h3" color="primary" sx={{ mb: 2 }}>
                  {aprobadores.filter(a => a.documento_id === parseInt(id) && a.estado === 'aprobado').length} / {aprobadores.filter(a => a.documento_id === parseInt(id)).length}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Aprobaciones completadas
                </Typography>
                {historialVersiones.length > 1 && (
                  <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                    Total de versiones: {historialVersiones.length}
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>

          {/* Historial de Aprobaciones */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Historial de Aprobaciones
              </Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell><strong>Versión</strong></TableCell>
                      <TableCell><strong>Nombre</strong></TableCell>
                      <TableCell><strong>Correo</strong></TableCell>
                      <TableCell><strong>Rol</strong></TableCell>
                      <TableCell><strong>Estado</strong></TableCell>
                      <TableCell><strong>Fecha</strong></TableCell>
                      <TableCell><strong>Observaciones</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {aprobadores
                      .sort((a, b) => b.version - a.version) // Ordenar por versión descendente
                      .map((aprobador, index) => (
                        <TableRow 
                          key={`${aprobador.id}-${aprobador.version}`}
                          sx={{
                            backgroundColor: aprobador.version === documento.version ? 'rgba(33, 150, 243, 0.08)' : 'inherit'
                          }}
                        >
                          <TableCell>
                            <Chip 
                              label={`v${aprobador.version}`} 
                              size="small"
                              color={aprobador.version === documento.version ? 'primary' : 'default'}
                            />
                          </TableCell>
                          <TableCell>{aprobador.usuario_nombre}</TableCell>
                          <TableCell>{aprobador.usuario_correo}</TableCell>
                          <TableCell>{aprobador.rol_aprobacion}</TableCell>
                          <TableCell>
                            <Chip
                              label={aprobador.estado}
                              color={getEstadoColor(aprobador.estado)}
                              size="small"
                              icon={getEstadoIcon(aprobador.estado)}
                            />
                          </TableCell>
                          <TableCell>
                            {aprobador.fecha_aprobacion 
                              ? new Date(aprobador.fecha_aprobacion).toLocaleString('es-MX')
                              : '-'}
                          </TableCell>
                          <TableCell>
                            {aprobador.estado === 'rechazado' && aprobador.motivo_rechazo ? (
                              <Typography variant="body2" color="error">
                                <strong>Motivo:</strong> {aprobador.motivo_rechazo}
                              </Typography>
                            ) : aprobador.estado === 'aprobado' ? (
                              <Typography variant="body2" color="success.main">
                                ✓ Aprobado
                              </Typography>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                Pendiente
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          {/* Firmas */}
          {firmas.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>
                  Firmas Digitales ({firmas.length})
                </Typography>
                <TableContainer>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Usuario</TableCell>
                        <TableCell>Fecha de Firma</TableCell>
                        <TableCell>IP</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {firmas.map((firma) => (
                        <TableRow key={firma.id}>
                          <TableCell>{firma.usuario_nombre}</TableCell>
                          <TableCell>
                            {new Date(firma.fecha_firma).toLocaleString('es-MX')}
                          </TableCell>
                          <TableCell>{firma.ip_address || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Grid>
          )}

          {/* Previsualización del PDF */}
          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Previsualización del Documento
              </Typography>
              {pdfUrl && (
                <Box sx={{ textAlign: 'center' }}>
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                  >
                    <Page pageNumber={pageNumber} width={800} />
                  </Document>
                  <Box sx={{ mt: 2 }}>
                    <Button
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber(pageNumber - 1)}
                      sx={{ mr: 1 }}
                    >
                      Anterior
                    </Button>
                    <Typography component="span" sx={{ mx: 2 }}>
                      Página {pageNumber} de {numPages}
                    </Typography>
                    <Button
                      disabled={pageNumber >= numPages}
                      onClick={() => setPageNumber(pageNumber + 1)}
                    >
                      Siguiente
                    </Button>
                  </Box>
                </Box>
              )}
            </Paper>
          </Grid>
        </Grid>
      </Container>

      {/* Diálogo de Edición */}
      <Dialog open={dialogoEditar} onClose={cerrarDialogoEditar} maxWidth="md" fullWidth>
          <DialogTitle>Editar Documento</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              margin="dense"
              label="Nombre del Archivo"
              fullWidth
              variant="outlined"
              value={formularioEditar.nombre_archivo}
              onChange={(e) => setFormularioEditar({ ...formularioEditar, nombre_archivo: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Tipo de Documento"
              fullWidth
              variant="outlined"
              value={formularioEditar.tipo_documento}
              onChange={(e) => setFormularioEditar({ ...formularioEditar, tipo_documento: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Descripción"
              fullWidth
              multiline
              rows={4}
              variant="outlined"
              value={formularioEditar.descripcion}
              onChange={(e) => setFormularioEditar({ ...formularioEditar, descripcion: e.target.value })}
              sx={{ mb: 2 }}
            />
            <TextField
              margin="dense"
              label="Tiempo Límite (horas)"
              type="number"
              fullWidth
              variant="outlined"
              value={formularioEditar.tiempo_limite_horas}
              onChange={(e) => setFormularioEditar({ ...formularioEditar, tiempo_limite_horas: e.target.value })}
              sx={{ mb: 2 }}
              helperText="Tiempo límite en horas para aprobar el documento"
            />
            <TextField
              margin="dense"
              label="Intervalo de Recordatorio (minutos)"
              type="number"
              fullWidth
              variant="outlined"
              value={formularioEditar.intervalo_recordatorio_minutos}
              onChange={(e) => setFormularioEditar({ ...formularioEditar, intervalo_recordatorio_minutos: e.target.value })}
              helperText="Cada cuántos minutos enviar recordatorios"
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={cerrarDialogoEditar}>Cancelar</Button>
            <Button onClick={handleEditar} variant="contained" color="primary">
              Guardar Cambios
            </Button>
          </DialogActions>
        </Dialog>

        {/* Diálogo de Confirmación de Eliminación */}
        <Dialog open={dialogoEliminar} onClose={cerrarDialogoEliminar}>
          <DialogTitle>Confirmar Eliminación</DialogTitle>
          <DialogContent>
            <DialogContentText>
              ¿Estás seguro de que deseas eliminar el documento "{documento?.nombre_archivo}"?
              <br />
              <strong>Esta acción no se puede deshacer.</strong>
              <br />
              Se eliminarán todas las versiones del documento y todos los archivos asociados.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={cerrarDialogoEliminar}>Cancelar</Button>
            <Button onClick={handleEliminar} variant="contained" color="error">
              Eliminar
            </Button>
          </DialogActions>
        </Dialog>
    </>
  );
};

export default VerDocumento;
