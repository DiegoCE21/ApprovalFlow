import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Grid, AppBar, Toolbar,
  Card, CardContent, Chip, Divider, Alert, Accordion, AccordionSummary,
  AccordionDetails, List, ListItem, ListItemIcon, ListItemText,
  FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { 
  Check, Close, Clear, ArrowBack, Description, Edit, 
  CheckCircle, Person, CalendarToday, ExpandMore, Info, Block
} from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { toast } from 'react-toastify';
import api from '../config/axios';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configurar worker de PDF.js
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const AprobarDocumento = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [documento, setDocumento] = useState(null);
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [loading, setLoading] = useState(true);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [rechazoDialogOpen, setRechazoDialogOpen] = useState(false);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [miEstado, setMiEstado] = useState(null); // Estado del usuario actual
  const [miembrosGrupo, setMiembrosGrupo] = useState([]);
  const [miembroSeleccionado, setMiembroSeleccionado] = useState('');
  const [cargandoMiembros, setCargandoMiembros] = useState(false);
  const [esGrupo, setIsGrupo] = useState(false);

  useEffect(() => {
    cargarDocumento();
  }, [token]);


  const cargarDocumento = async () => {
    try {
      const response = await api.get(`/documentos/token/${token}`);
      const doc = response.data.documento;
      setDocumento(doc);

      // Encontrar el estado del aprobador actual (quien tiene este token)
      const aprobadorActual = doc.aprobadores?.find(a => a.token_firma === token);
      if (aprobadorActual) {
        setMiEstado(aprobadorActual.estado);
        // Verificar si es un grupo
        if (aprobadorActual.correo_grupo) {
          setIsGrupo(true);
          cargarMiembrosGrupo(aprobadorActual.correo_grupo);
        }
      }

      // Construir URL del PDF usando el token (no requiere autenticación)
      const pdfResponse = await api.get(`/documentos/descargar-token/${token}`, {
        responseType: 'blob'
      });
      const pdfBlob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);

      setLoading(false);
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Error al cargar el documento';
      toast.error(errorMessage);
      
      // Si el error es de permisos, redirigir al dashboard después de 3 segundos
      if (error.response?.status === 403) {
        setTimeout(() => {
          navigate('/dashboard');
        }, 3000);
      }
      
      console.error(error);
      setLoading(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const cargarMiembrosGrupo = async (correoGrupo) => {
    if (!correoGrupo) return;
    
    setCargandoMiembros(true);
    try {
      const response = await api.get(`/grupos/miembros?correo=${encodeURIComponent(correoGrupo)}`);
      setMiembrosGrupo(response.data.miembros || []);
    } catch (error) {
      console.error('Error al cargar miembros del grupo:', error);
      toast.error('Error al cargar los miembros del grupo');
      setMiembrosGrupo([]);
    } finally {
      setCargandoMiembros(false);
    }
  };


  const handleAprobar = async () => {
    // Si es un grupo, validar que se haya seleccionado un miembro
    if (esGrupo && !miembroSeleccionado) {
      toast.error('Por favor, selecciona la persona que está firmando por el grupo');
      return;
    }

    try {
      const response = await api.post('/firmas/firmar', {
        token: token,
        grupoMiembroId: esGrupo && miembroSeleccionado ? Number(miembroSeleccionado) : null
      });

      if (response.data.success) {
        toast.success('Documento aprobado exitosamente');
        setConfirmDialogOpen(false);
        
        if (response.data.todosAprobaron) {
          toast.info('¡Todos los aprobadores han firmado el documento!');
        }

        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Error al aprobar el documento');
    }
  };

  const handleRechazar = async () => {
    if (!motivoRechazo.trim()) {
      toast.error('Por favor, indica el motivo del rechazo');
      return;
    }

    try {
      const response = await api.post('/firmas/rechazar', {
        token: token,
        motivo: motivoRechazo
      });

      if (response.data.success) {
        toast.success('Documento rechazado. Se ha notificado al departamento de Calidad.');
        setRechazoDialogOpen(false);
        setTimeout(() => navigate('/dashboard'), 2000);
      }
    } catch (error) {
      toast.error('Error al rechazar el documento');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <Container>
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography>Cargando documento...</Typography>
        </Box>
      </Container>
    );
  }

  if (!documento) {
    return (
      <Container>
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography>Documento no encontrado</Typography>
          <Button sx={{ mt: 2 }} onClick={() => navigate('/dashboard')}>
            Volver al Dashboard
          </Button>
        </Box>
      </Container>
    );
  }

  return (
    <>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'primary.main' }}>
        <Toolbar>
          <Button 
            color="inherit" 
            startIcon={<ArrowBack />} 
            onClick={() => navigate('/dashboard')}
            sx={{ mr: 2 }}
          >
            Volver
          </Button>
          <Description sx={{ mr: 2, fontSize: 28 }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Revisión de Documento
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Aprobación y Firma Digital
            </Typography>
          </Box>
        </Toolbar>
      </AppBar>

      <Box sx={{ bgcolor: 'background.default', minHeight: 'calc(100vh - 64px)' }}>
        <Container maxWidth="lg" sx={{ pt: 4, pb: 6 }}>
          <Alert severity="info" sx={{ mb: 3 }}>
            <strong>Importante:</strong> Revisa cuidadosamente el documento antes de aprobar. Tu nombre completo será registrado en el documento como aprobación digital.
          </Alert>

          {/* Mostrar alerta si YA aprobó/rechazó */}
          {miEstado === 'aprobado' && (
            <Alert severity="success" sx={{ mb: 3 }}>
              <strong>✅ Ya aprobaste este documento</strong>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Tu aprobación fue registrada exitosamente. Ya no puedes modificar tu decisión.
              </Typography>
            </Alert>
          )}

          {miEstado === 'rechazado' && (
            <Alert severity="error" sx={{ mb: 3 }}>
              <strong>❌ Ya rechazaste este documento</strong>
              <Typography variant="body2" sx={{ mt: 1 }}>
                Tu rechazo fue registrado. Ya no puedes modificar tu decisión.
              </Typography>
            </Alert>
          )}

          {/* Mostrar alerta si alguien ya rechazó (y el usuario aún no ha decidido) */}
          {miEstado === 'pendiente' && documento?.aprobadores?.some(a => a.estado === 'rechazado') && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              <strong>⚠️ Atención:</strong> Este documento ya ha sido rechazado por al menos un aprobador. Revisa los motivos en la sección "Estado de Aprobaciones".
            </Alert>
          )}

          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Typography variant="h5" sx={{ fontWeight: 600, mb: 3 }}>
                    {documento.nombre_archivo}
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', alignItems: 'start', gap: 2 }}>
                        <Description sx={{ color: 'primary.main', mt: 0.5 }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Descripción
                          </Typography>
                          <Typography variant="body1">
                            {documento.descripcion}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Person sx={{ color: 'primary.main' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Creado por
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {documento.usuario_creador_nombre}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <CalendarToday sx={{ color: 'primary.main' }} />
                        <Box>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Fecha de creación
                          </Typography>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {new Date(documento.fecha_creacion).toLocaleDateString('es-MX', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </Typography>
                        </Box>
                      </Box>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                    Estado de Aprobaciones
                  </Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {documento.aprobadores?.map((apr, idx) => (
                      <Box key={idx}>
                        <Box 
                          sx={{ 
                            display: 'flex', 
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1.5,
                            borderRadius: 1,
                            bgcolor: apr.estado === 'aprobado' ? 'success.lighter' : 
                                      apr.estado === 'rechazado' ? 'error.lighter' : 'background.default',
                            border: '1px solid',
                            borderColor: apr.estado === 'aprobado' ? 'success.main' :
                                        apr.estado === 'rechazado' ? 'error.main' : 'divider'
                          }}
                        >
                          <Box sx={{ flexGrow: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                              {apr.estado === 'aprobado' ? (
                                <CheckCircle sx={{ color: 'success.main', fontSize: 20 }} />
                              ) : apr.estado === 'rechazado' ? (
                                <Block sx={{ color: 'error.main', fontSize: 20 }} />
                              ) : (
                                <Person sx={{ color: 'text.secondary', fontSize: 20 }} />
                              )}
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {apr.usuario_nombre}
                              </Typography>
                            </Box>
                            {apr.fecha_aprobacion && (
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 3.5 }}>
                                {new Date(apr.fecha_aprobacion).toLocaleString('es-MX', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </Typography>
                            )}
                          </Box>
                          <Chip 
                            label={apr.estado.toUpperCase()} 
                            size="small"
                            color={
                              apr.estado === 'aprobado' ? 'success' : 
                              apr.estado === 'rechazado' ? 'error' : 'default'
                            }
                          />
                        </Box>
                        
                        {/* Mostrar motivo de rechazo si existe */}
                        {apr.estado === 'rechazado' && apr.motivo_rechazo && (
                          <Alert severity="error" sx={{ mt: 1, py: 0.5 }}>
                            <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 0.5 }}>
                              Motivo del rechazo:
                            </Typography>
                            <Typography variant="caption">
                              {apr.motivo_rechazo}
                            </Typography>
                          </Alert>
                        )}
                      </Box>
                    ))}
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Card sx={{ mb: 4 }}>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  Previsualización del Documento
                </Typography>
                {numPages && (
                  <Chip 
                    label={`${numPages} página${numPages > 1 ? 's' : ''}`}
                    color="primary"
                    variant="outlined"
                    size="small"
                  />
                )}
              </Box>

              {pdfUrl && (
                <Box>
                  {/* Controles superiores */}
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    gap: 2,
                    mb: 2,
                    p: 2,
                    bgcolor: 'background.default',
                    borderRadius: 2
                  }}>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber(1)}
                      sx={{ minWidth: 'auto', px: 2 }}
                    >
                      Primera
                    </Button>
                    <Button
                      variant="outlined"
                      disabled={pageNumber <= 1}
                      onClick={() => setPageNumber(pageNumber - 1)}
                    >
                      ← Anterior
                    </Button>
                    <Chip 
                      label={`Página ${pageNumber} / ${numPages}`}
                      color="primary"
                      sx={{ px: 3, fontWeight: 600, fontSize: '0.9rem' }}
                    />
                    <Button
                      variant="outlined"
                      disabled={pageNumber >= numPages}
                      onClick={() => setPageNumber(pageNumber + 1)}
                    >
                      Siguiente →
                    </Button>
                    <Button
                      variant="contained"
                      size="small"
                      disabled={pageNumber >= numPages}
                      onClick={() => setPageNumber(numPages)}
                      sx={{ minWidth: 'auto', px: 2 }}
                    >
                      Última
                    </Button>
                  </Box>

                  {/* Visor del PDF */}
                  <Box sx={{ 
                    border: '2px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 3,
                    bgcolor: '#e5e7eb',
                    display: 'flex',
                    justifyContent: 'center',
                    minHeight: 600,
                    position: 'relative',
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.06)'
                  }}>
                    <Box sx={{ 
                      boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                      borderRadius: 1,
                      overflow: 'hidden',
                      bgcolor: 'white'
                    }}>
                      <Document
                        file={pdfUrl}
                        onLoadSuccess={onDocumentLoadSuccess}
                        loading={
                          <Box sx={{ p: 8, textAlign: 'center' }}>
                            <Typography variant="body2" color="text.secondary">
                              Cargando PDF...
                            </Typography>
                          </Box>
                        }
                      >
                        <Page 
                          pageNumber={pageNumber} 
                          width={800}
                          renderTextLayer={false}
                          renderAnnotationLayer={false}
                        />
                      </Document>
                    </Box>
                  </Box>

                  {/* Navegación rápida por páginas (si hay más de 3 páginas) */}
                  {numPages > 3 && (
                    <Box sx={{ 
                      mt: 2, 
                      display: 'flex', 
                      justifyContent: 'center',
                      gap: 1,
                      flexWrap: 'wrap'
                    }}>
                      {Array.from({ length: numPages }, (_, i) => i + 1).map(page => (
                        <Button
                          key={page}
                          variant={page === pageNumber ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => setPageNumber(page)}
                          sx={{ 
                            minWidth: 40,
                            height: 36
                          }}
                        >
                          {page}
                        </Button>
                      ))}
                    </Box>
                  )}
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Solo mostrar botones si aún está pendiente */}
          {miEstado === 'pendiente' ? (
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 3, textAlign: 'center' }}>
                  ¿Cuál es tu decisión?
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="contained"
                      color="success"
                      startIcon={<Check />}
                      size="large"
                      fullWidth
                      onClick={() => setConfirmDialogOpen(true)}
                      sx={{
                        py: 2,
                        fontSize: '1rem',
                        fontWeight: 600
                      }}
                    >
                      Aprobar y Firmar
                    </Button>
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Button
                      variant="outlined"
                      color="error"
                      startIcon={<Close />}
                      size="large"
                      fullWidth
                      onClick={() => setRechazoDialogOpen(true)}
                      sx={{ 
                        py: 2,
                        fontSize: '1rem',
                        fontWeight: 600
                      }}
                    >
                      Rechazar Documento
                    </Button>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent sx={{ textAlign: 'center', py: 4 }}>
                {miEstado === 'aprobado' ? (
                  <>
                    <CheckCircle sx={{ fontSize: 64, color: 'success.main', mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      Ya aprobaste este documento
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tu aprobación ha sido registrada. Gracias por tu tiempo.
                    </Typography>
                  </>
                ) : miEstado === 'rechazado' ? (
                  <>
                    <Block sx={{ fontSize: 64, color: 'error.main', mb: 2 }} />
                    <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                      Ya rechazaste este documento
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Tu rechazo ha sido registrado y el creador ha sido notificado.
                    </Typography>
                  </>
                ) : null}
                <Button
                  variant="outlined"
                  startIcon={<ArrowBack />}
                  onClick={() => navigate('/dashboard')}
                  sx={{ mt: 3 }}
                >
                  Volver al Dashboard
                </Button>
              </CardContent>
            </Card>
          )}
        </Container>
      </Box>

      {/* Dialog de Confirmación */}
      <Dialog 
        open={confirmDialogOpen} 
        onClose={() => setConfirmDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ bgcolor: 'success.main', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircle />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Confirmar Aprobación
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Verifica antes de continuar
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta acción no se puede deshacer
          </Alert>
          <Typography variant="body1" sx={{ mb: 2 }}>
            ¿Estás seguro de que deseas <strong>aprobar</strong> este documento?
          </Typography>
          
          {esGrupo && (
            <Box sx={{ mb: 2 }}>
              <FormControl fullWidth required>
                <InputLabel>Selecciona quién está firmando</InputLabel>
                <Select
                  value={miembroSeleccionado}
                  label="Selecciona quién está firmando"
                  onChange={(e) => setMiembroSeleccionado(e.target.value)}
                  disabled={cargandoMiembros}
                >
                  {cargandoMiembros ? (
                    <MenuItem disabled>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Cargando miembros...
                    </MenuItem>
                  ) : miembrosGrupo.length === 0 ? (
                    <MenuItem disabled>No hay miembros disponibles</MenuItem>
                  ) : (
                    miembrosGrupo.map((miembro) => (
                      <MenuItem key={miembro.registroId} value={miembro.registroId}>
                        <Box>
                          <Typography variant="body1">{miembro.nombre}</Typography>
                          {miembro.correo && (
                            <Typography variant="caption" color="text.secondary">
                              {miembro.correo}
                            </Typography>
                          )}
                        </Box>
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Box>
          )}
          
          <Typography variant="body2" color="text.secondary">
            {esGrupo 
              ? 'El nombre de la persona seleccionada será registrado en el documento como aprobación digital.'
              : 'Tu nombre completo será registrado en el documento como aprobación digital.'}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button 
            onClick={() => setConfirmDialogOpen(false)} 
            variant="outlined"
            color="inherit"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleAprobar} 
            variant="contained" 
            color="success"
            size="large"
            sx={{ px: 4 }}
            startIcon={<Check />}
          >
            Sí, Aprobar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Rechazo */}
      <Dialog 
        open={rechazoDialogOpen} 
        onClose={() => setRechazoDialogOpen(false)} 
        maxWidth="sm" 
        fullWidth
        PaperProps={{
          sx: { borderRadius: 3 }
        }}
      >
        <DialogTitle sx={{ bgcolor: 'error.main', color: 'white', display: 'flex', alignItems: 'center', gap: 1 }}>
          <Close />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Rechazar Documento
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.9 }}>
              Indica el motivo del rechazo
            </Typography>
          </Box>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Typography variant="body2" sx={{ mb: 2 }}>
            Por favor, indica el motivo del rechazo:
          </Typography>
          <TextField
            fullWidth
            multiline
            rows={4}
            value={motivoRechazo}
            onChange={(e) => setMotivoRechazo(e.target.value)}
            placeholder="Escribe aquí el motivo del rechazo..."
          />
        </DialogContent>
        <DialogActions sx={{ p: 2.5, gap: 1 }}>
          <Button 
            onClick={() => setRechazoDialogOpen(false)} 
            variant="outlined"
            color="inherit"
          >
            Cancelar
          </Button>
          <Button 
            onClick={handleRechazar} 
            variant="contained" 
            color="error"
            size="large"
            sx={{ px: 4 }}
          >
            Confirmar Rechazo
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default AprobarDocumento;
