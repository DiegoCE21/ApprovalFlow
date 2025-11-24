import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  List, ListItem, ListItemText, Chip, Alert, Card, CardContent,
  IconButton, CircularProgress
} from '@mui/material';
import { ArrowBack, CheckCircle, Delete, ZoomIn, ZoomOut, Save } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { toast } from 'react-toastify';
import api from '../config/axios';
import { esAdminDesdeUser } from '../utils/adminHelper.js';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const EditarPosicionesFirmas = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [aprobadores, setAprobadores] = useState([]);
  const [aprobadorActual, setAprobadorActual] = useState(0);
  const [escala, setEscala] = useState(1.0);
  const [dimensionesPagina, setDimensionesPagina] = useState({ width: 0, height: 0 });
  const [dimensionesPDFReales, setDimensionesPDFReales] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [dibujando, setDibujando] = useState(false);
  const [puntoInicio, setPuntoInicio] = useState(null);
  const [rectanguloTemporal, setRectanguloTemporal] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (userData) {
      const userObj = JSON.parse(userData);
      setUser(userObj);
      
      // Verificar que el usuario es administrador
      if (!esAdminDesdeUser(userObj)) {
        toast.error('No tienes permiso para editar posiciones de firmas');
        navigate(`/documento/${id}`);
        return;
      }
    }
    
    cargarDocumento();
  }, [id]);

  // Actualizar dimensiones cuando cambia la página
  useEffect(() => {
    // Las dimensiones se actualizarán cuando se cargue la página en onPageLoadSuccess
    // Este efecto solo resetea las dimensiones para forzar recálculo
    if (numPages && pageNumber) {
      setDimensionesPDFReales({ width: 0, height: 0 });
    }
  }, [pageNumber, numPages]);

  const cargarDocumento = async () => {
    try {
      setCargando(true);
      
      // Obtener información del documento
      const docResponse = await api.get(`/documentos/${id}`);
      const documento = docResponse.data.documento;
      
      // Obtener aprobadores con sus posiciones actuales
      const aprobadoresResponse = await api.get(`/documentos/${id}/aprobadores`);
      const aprobadoresData = aprobadoresResponse.data.aprobadores || [];
      
      // Convertir aprobadores al formato esperado con posiciones
      const aprobadoresConPosicion = aprobadoresData.map(aprobador => ({
        id: aprobador.id,
        aprobador_id: aprobador.id,
        usuarioId: aprobador.usuario_id,
        nombre: aprobador.usuario_nombre,
        correo: aprobador.usuario_correo,
        rol: aprobador.rol_aprobacion || 'aprobador',
        correoGrupo: aprobador.correo_grupo || null,
        grupoMiembroId: aprobador.grupo_miembro_id || null,
        posicion: aprobador.posicion_x !== null && aprobador.posicion_y !== null ? {
          x: aprobador.posicion_x,
          y: aprobador.posicion_y,
          pagina: aprobador.pagina_firma !== null ? aprobador.pagina_firma : -1,
          ancho: aprobador.ancho_firma || 150,
          alto: aprobador.alto_firma || 75
        } : null
      }));
      
      setAprobadores(aprobadoresConPosicion);
      
      // Cargar PDF
      const pdfResponse = await api.get(`/documentos/descargar/${id}`, {
        responseType: 'blob'
      });
      const pdfBlob = new Blob([pdfResponse.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(pdfBlob);
      setPdfUrl(url);
      
      setCargando(false);
    } catch (error) {
      console.error('Error al cargar documento:', error);
      toast.error('Error al cargar el documento');
      setCargando(false);
    }
  };

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    const viewport = page.getViewport({ scale: 1.0 });
    setDimensionesPagina({
      width: viewport.width,
      height: viewport.height
    });
    
    // Las dimensiones del viewport con scale 1.0 son las dimensiones reales del PDF
    // Guardarlas para usar en la conversión de coordenadas
    setDimensionesPDFReales({
      width: viewport.width,
      height: viewport.height
    });
  };

  const handleMouseDown = (event) => {
    if (aprobadorActual >= aprobadores.length) {
      toast.info('Ya has asignado posiciones a todos los aprobadores');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / escala;
    const y = (event.clientY - rect.top) / escala;

    setDibujando(true);
    setPuntoInicio({ x, y });
    setRectanguloTemporal({ x, y, ancho: 0, alto: 0 });
  };

  const handleMouseMove = (event) => {
    if (!dibujando || !puntoInicio) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / escala;
    const y = (event.clientY - rect.top) / escala;

    const ancho = x - puntoInicio.x;
    const alto = y - puntoInicio.y;

    setRectanguloTemporal({
      x: puntoInicio.x,
      y: puntoInicio.y,
      ancho,
      alto
    });
  };

  const handleMouseUp = (event) => {
    if (!dibujando || !puntoInicio) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / escala;
    const y = (event.clientY - rect.top) / escala;

    const ancho = Math.abs(x - puntoInicio.x);
    const alto = Math.abs(y - puntoInicio.y);

    // Verificar que el rectángulo tenga un tamaño mínimo
    if (ancho < 20 || alto < 15) {
      toast.warning('El rectángulo es muy pequeño. Mínimo: 20x15 píxeles.');
      setDibujando(false);
      setPuntoInicio(null);
      setRectanguloTemporal(null);
      return;
    }

    // Calcular posición real (esquina superior izquierda)
    const realX = Math.min(puntoInicio.x, x);
    const realY = Math.min(puntoInicio.y, y);

    // Obtener dimensiones reales del PDF
    // Usar dimensionesPDFReales si están disponibles, de lo contrario usar dimensionesPagina
    // Ambas deberían ser iguales cuando scale=1.0, pero dimensionesPDFReales es más confiable
    const alturaPDF = dimensionesPDFReales.height > 0 ? dimensionesPDFReales.height : dimensionesPagina.height;
    
    if (alturaPDF <= 0) {
      toast.error('Error: No se pudieron obtener las dimensiones del PDF. Intenta recargar la página.');
      setDibujando(false);
      setPuntoInicio(null);
      setRectanguloTemporal(null);
      return;
    }
    
    // Convertir coordenadas de canvas a coordenadas PDF
    // IMPORTANTE: En PDF, Y inicia desde abajo (0 está en la parte inferior)
    // En canvas/web, Y inicia desde arriba (0 está en la parte superior)
    // 
    // En el backend, la coordenada Y representa la parte INFERIOR del rectángulo (desde abajo)
    // 
    // Si dibujamos un rectángulo en canvas desde (realX, realY) con altura 'alto':
    // - La esquina superior izquierda en canvas está en Y = realY (desde arriba)
    // - La esquina inferior izquierda en canvas está en Y = realY + alto (desde arriba)
    // 
    // En PDF, necesitamos la coordenada Y de la esquina inferior izquierda del rectángulo
    // (porque Y en PDF se mide desde abajo y el backend espera la parte inferior):
    // - La esquina inferior izquierda en PDF está en Y = alturaPDF - (realY + alto)
    const pdfX = realX;
    const pdfY = alturaPDF - (realY + alto);
    
    // Validar que las coordenadas estén dentro del PDF
    if (pdfX < 0 || pdfY < 0 || pdfX + ancho > dimensionesPDFReales.width || pdfY + alto > alturaPDF) {
      console.warn('Coordenadas fuera de rango:', { pdfX, pdfY, ancho, alto, width: dimensionesPDFReales.width, height: alturaPDF });
    }

    const nuevaPosicion = {
      x: pdfX,
      y: pdfY,
      pagina: pageNumber,
      ancho: ancho,
      alto: alto
    };
    
    // Debug: Log de las coordenadas calculadas
    console.log('🔍 Frontend - Coordenadas calculadas:', {
      realX,
      realY,
      ancho,
      alto,
      alturaPDF,
      pdfX,
      pdfY,
      pageNumber,
      dimensionesPDFReales,
      dimensionesPagina
    });

    const nuevosAprobadores = [...aprobadores];
    nuevosAprobadores[aprobadorActual] = {
      ...nuevosAprobadores[aprobadorActual],
      posicion: nuevaPosicion
    };

    setAprobadores(nuevosAprobadores);
    setAprobadorActual((prev) => prev + 1);

    toast.success(`Posición actualizada para ${aprobadores[aprobadorActual].nombre}`);

    // Limpiar estado de dibujo
    setDibujando(false);
    setPuntoInicio(null);
    setRectanguloTemporal(null);
  };

  const eliminarPosicion = (index) => {
    const nuevosAprobadores = [...aprobadores];
    nuevosAprobadores[index] = {
      ...nuevosAprobadores[index],
      posicion: null
    };
    setAprobadores(nuevosAprobadores);
    
    // Seleccionar este aprobador para dibujar nueva posición
    setAprobadorActual(index);
    toast.info(`Posición eliminada. Dibuja una nueva posición para ${aprobadores[index].nombre}`);
  };

  const seleccionarAprobador = (index) => {
    setAprobadorActual(index);
    toast.info(`Seleccionado: ${aprobadores[index].nombre}. Dibuja el rectángulo para su firma.`);
  };

  const handleGuardar = async () => {
    // Verificar que todos tengan posición
    const faltanPosiciones = aprobadores.filter(a => !a.posicion);
    if (faltanPosiciones.length > 0) {
      toast.error('Debes asignar posiciones a todos los aprobadores');
      return;
    }

    setLoading(true);

    try {
      // Preparar datos de aprobadores con sus posiciones
      const aprobadoresData = aprobadores.map(a => ({
        aprobador_id: a.aprobador_id || a.id,
        posicion_x: a.posicion.x,
        posicion_y: a.posicion.y,
        pagina_firma: a.posicion.pagina,
        ancho_firma: a.posicion.ancho,
        alto_firma: a.posicion.alto
      }));

      // Llamar al endpoint para actualizar posiciones
      const response = await api.put(`/documentos/${id}/posiciones-firmas`, {
        aprobadores: aprobadoresData
      });

      if (response.data.success) {
        toast.success(`Posiciones actualizadas exitosamente. ${response.data.firmasReaplicadas || 0} firma(s) reaplicada(s).`);
        navigate(`/documento/${id}`);
      }
    } catch (error) {
      console.error('Error al actualizar posiciones:', error);
      toast.error(error.response?.data?.message || 'Error al actualizar posiciones de firmas');
    } finally {
      setLoading(false);
    }
  };

  if (cargando) {
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
          <Button color="inherit" startIcon={<ArrowBack />} onClick={() => navigate(`/documento/${id}`)}>
            Volver
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            Editar Posiciones de Firmas
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="xl" sx={{ mt: 3, mb: 4 }}>
        <Alert severity="info" sx={{ mb: 3 }}>
          <strong>Instrucciones:</strong>
          <br />1. Haz clic en un aprobador de la lista para seleccionarlo
          <br />2. Dibuja un rectángulo en el PDF (clic y arrastra) donde debe ir su firma
          <br />3. El aprobador seleccionado se muestra resaltado en azul
          <br />4. Puedes eliminar y redibujar cualquier posición
          <br />5. Las firmas existentes se reaplicarán automáticamente en las nuevas posiciones
        </Alert>

        <Box sx={{ display: 'flex', gap: 3 }}>
          {/* Panel izquierdo - PDF */}
          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Documento
                </Typography>
                <Box>
                  <IconButton onClick={() => setEscala(Math.max(0.5, escala - 0.1))}>
                    <ZoomOut />
                  </IconButton>
                  <Typography component="span" sx={{ mx: 1 }}>
                    {Math.round(escala * 100)}%
                  </Typography>
                  <IconButton onClick={() => setEscala(Math.min(2.0, escala + 0.1))}>
                    <ZoomIn />
                  </IconButton>
                </Box>
              </Box>

              {pdfUrl && (
                <Box 
                  sx={{ 
                    border: '2px solid #2196f3', 
                    borderRadius: 1, 
                    overflow: 'auto',
                    cursor: dibujando ? 'crosshair' : 'default',
                    position: 'relative',
                    userSelect: 'none'
                  }}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={() => {
                    if (dibujando) {
                      setDibujando(false);
                      setPuntoInicio(null);
                      setRectanguloTemporal(null);
                    }
                  }}
                  ref={canvasRef}
                >
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={onDocumentLoadSuccess}
                  >
                    <Page 
                      pageNumber={pageNumber} 
                      scale={escala}
                      onLoadSuccess={onPageLoadSuccess}
                    />
                  </Document>

                  {/* Rectángulo temporal mientras se dibuja */}
                  {rectanguloTemporal && (
                    <Box
                      sx={{
                        position: 'absolute',
                        left: Math.min(rectanguloTemporal.x, rectanguloTemporal.x + rectanguloTemporal.ancho) * escala,
                        top: Math.min(rectanguloTemporal.y, rectanguloTemporal.y + rectanguloTemporal.alto) * escala,
                        width: Math.abs(rectanguloTemporal.ancho) * escala,
                        height: Math.abs(rectanguloTemporal.alto) * escala,
                        border: '3px dashed blue',
                        backgroundColor: 'rgba(33, 150, 243, 0.2)',
                        pointerEvents: 'none'
                      }}
                    />
                  )}

                  {/* Mostrar marcadores de posiciones ya definidas */}
                  {aprobadores.map((aprobador, idx) => {
                    if (!aprobador.posicion) return null;
                    // Si pagina es -1, mostrar en la última página
                    const paginaAprobador = aprobador.posicion.pagina === -1 ? numPages : aprobador.posicion.pagina;
                    if (paginaAprobador !== pageNumber) return null;
                    
                    // Convertir coordenadas PDF a coordenadas canvas para mostrar
                    // IMPORTANTE: En el backend, y es la coordenada de la parte INFERIOR del rectángulo (desde abajo)
                    // En canvas, necesitamos la coordenada de la parte SUPERIOR del rectángulo (desde arriba)
                    const alturaPDF = dimensionesPDFReales.height > 0 ? dimensionesPDFReales.height : dimensionesPagina.height;
                    const markerX = aprobador.posicion.x * escala;
                    // Si y en PDF es la parte inferior (desde abajo), entonces:
                    // - La parte superior está en (y + alto) desde abajo
                    // - En canvas, la parte superior está en: alturaPDF - (y + alto) desde arriba
                    const markerY = (alturaPDF - aprobador.posicion.y - aprobador.posicion.alto) * escala;
                    
                    return (
                      <Box
                        key={idx}
                        sx={{
                          position: 'absolute',
                          left: markerX,
                          top: markerY,
                          width: aprobador.posicion.ancho * escala,
                          height: aprobador.posicion.alto * escala,
                          border: '2px solid green',
                          backgroundColor: 'rgba(0, 255, 0, 0.1)',
                          pointerEvents: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Typography variant="caption" sx={{ color: 'green', fontWeight: 'bold' }}>
                          {aprobador.nombre}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}

              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center', gap: 2 }}>
                <Button
                  disabled={pageNumber <= 1}
                  onClick={() => setPageNumber(pageNumber - 1)}
                >
                  Anterior
                </Button>
                <Typography sx={{ alignSelf: 'center' }}>
                  Página {pageNumber} de {numPages}
                </Typography>
                <Button
                  disabled={pageNumber >= numPages}
                  onClick={() => setPageNumber(pageNumber + 1)}
                >
                  Siguiente
                </Button>
              </Box>
            </Paper>
          </Box>

          {/* Panel derecho - Lista de aprobadores */}
          <Box sx={{ width: 350 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Aprobadores ({aprobadores.filter(a => a.posicion).length}/{aprobadores.length})
                </Typography>

                <List>
                  {aprobadores.map((aprobador, index) => (
                    <ListItem
                      key={index}
                      button
                      onClick={() => seleccionarAprobador(index)}
                      sx={{
                        bgcolor: index === aprobadorActual ? 'primary.light' : 'transparent',
                        borderRadius: 1,
                        mb: 1,
                        border: index === aprobadorActual ? '2px solid' : '1px solid',
                        borderColor: index === aprobadorActual ? 'primary.main' : 'divider',
                        cursor: 'pointer',
                        '&:hover': {
                          bgcolor: index === aprobadorActual ? 'primary.light' : 'action.hover'
                        }
                      }}
                      secondaryAction={
                        aprobador.posicion && (
                          <IconButton edge="end" onClick={(e) => {
                            e.stopPropagation();
                            eliminarPosicion(index);
                          }}>
                            <Delete />
                          </IconButton>
                        )
                      }
                    >
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {aprobador.posicion && <CheckCircle color="success" fontSize="small" />}
                            <Typography variant="body2" fontWeight={index === aprobadorActual ? 'bold' : 'normal'}>
                              {aprobador.nombre}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography variant="caption" display="block">
                              {aprobador.correo}
                            </Typography>
                            {aprobador.posicion && (
                              <Chip
                                label={`Página ${aprobador.posicion.pagina === -1 ? numPages : aprobador.posicion.pagina}`}
                                size="small"
                                color="success"
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>

                <Box sx={{ mt: 3 }}>
                  <Button
                    fullWidth
                    variant="contained"
                    color="primary"
                    startIcon={<Save />}
                    onClick={handleGuardar}
                    disabled={loading || aprobadores.some(a => !a.posicion)}
                  >
                    {loading ? 'Guardando...' : 'Guardar Posiciones y Reaplicar Firmas'}
                  </Button>
                </Box>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Container>
    </>
  );
};

export default EditarPosicionesFirmas;

