import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  List, ListItem, ListItemText, Chip, Alert, Card, CardContent,
  IconButton, TextField
} from '@mui/material';
import { ArrowBack, CheckCircle, Delete, ZoomIn, ZoomOut } from '@mui/icons-material';
import { Document, Page, pdfjs } from 'react-pdf';
import { toast } from 'react-toastify';
import api from '../config/axios';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

const DefinirPosicionesFirmas = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const canvasRef = useRef(null);
  
  const { archivo, tipoDocumento, descripcion, aprobadores, tiempoLimiteHoras, intervaloRecordatorioMinutos, esNuevaVersion, documentoAnteriorId } = location.state || {};
  
  const [pdfUrl, setPdfUrl] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [aprobadoresConPosicion, setAprobadoresConPosicion] = useState([]);
  const [aprobadorActual, setAprobadorActual] = useState(0);
  const [escala, setEscala] = useState(1.0);
  const [dimensionesPagina, setDimensionesPagina] = useState({ width: 0, height: 0 });
  const [loading, setLoading] = useState(false);
  const [dibujando, setDibujando] = useState(false);
  const [puntoInicio, setPuntoInicio] = useState(null);
  const [rectanguloTemporal, setRectanguloTemporal] = useState(null);

  useEffect(() => {
    if (!archivo || !aprobadores) {
      toast.error('Faltan datos del documento');
      navigate('/subir-documento');
      return;
    }

    // Crear URL del PDF
    const url = URL.createObjectURL(archivo);
    setPdfUrl(url);

    // Inicializar aprobadores sin posiciones
    setAprobadoresConPosicion(aprobadores.map(a => ({ ...a, posicion: null })));

    return () => URL.revokeObjectURL(url);
  }, [archivo, aprobadores]);

  const onDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
  };

  const onPageLoadSuccess = (page) => {
    const viewport = page.getViewport({ scale: 1.0 });
    setDimensionesPagina({
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

    // Convertir coordenadas de canvas a coordenadas PDF
    // En PDF, Y inicia desde abajo, en canvas desde arriba
    const pdfX = realX;
    const pdfY = dimensionesPagina.height - realY - alto;

    const nuevaPosicion = {
      x: pdfX,
      y: pdfY,
      pagina: pageNumber,
      ancho: ancho,
      alto: alto
    };

    const nuevosAprobadores = [...aprobadoresConPosicion];
    nuevosAprobadores[aprobadorActual] = {
      ...nuevosAprobadores[aprobadorActual],
      posicion: nuevaPosicion
    };

    setAprobadoresConPosicion(nuevosAprobadores);
    setAprobadorActual(aprobadorActual + 1);

    toast.success(`Posición asignada para ${aprobadores[aprobadorActual].nombre}`);

    // Limpiar estado de dibujo
    setDibujando(false);
    setPuntoInicio(null);
    setRectanguloTemporal(null);
  };

  const eliminarPosicion = (index) => {
    const nuevosAprobadores = [...aprobadoresConPosicion];
    nuevosAprobadores[index] = {
      ...nuevosAprobadores[index],
      posicion: null
    };
    setAprobadoresConPosicion(nuevosAprobadores);
    
    // Seleccionar este aprobador para dibujar nueva posición
    setAprobadorActual(index);
  };

  const seleccionarAprobador = (index) => {
    // Si ya tiene posición, no hacer nada (usar el botón eliminar en su lugar)
    if (aprobadoresConPosicion[index].posicion) {
      toast.info('Este aprobador ya tiene posición. Usa el botón eliminar para reasignar.');
      return;
    }
    setAprobadorActual(index);
    toast.info(`Ahora dibuja el rectángulo para ${aprobadores[index].nombre}`);
  };

  const handleSubmit = async () => {
    // Verificar que todos tengan posición
    const faltanPosiciones = aprobadoresConPosicion.filter(a => !a.posicion);
    if (faltanPosiciones.length > 0) {
      toast.error('Debes asignar posiciones a todos los aprobadores');
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('documento', archivo);
      formData.append('tipoDocumento', tipoDocumento);
      formData.append('descripcion', descripcion);

      // Agregar aprobadores con sus posiciones
      const aprobadoresData = aprobadoresConPosicion.map(a => ({
        id: a.id,
        usuarioId: a.usuarioId ?? a.id,
        nombre: a.nombre,
        correo: a.correo,
        rol: a.rol || 'aprobador',
        correoGrupo: a.correoGrupo ?? a.correo_grupo ?? null,
        grupoMiembroId: a.grupoMiembroId ?? a.grupo_miembro_id ?? null,
        posicion_x: a.posicion.x,
        posicion_y: a.posicion.y,
        pagina_firma: a.posicion.pagina,
        ancho_firma: a.posicion.ancho,
        alto_firma: a.posicion.alto
      }));

      formData.append('aprobadores', JSON.stringify(aprobadoresData));
      
      // Agregar campos de tiempo
      if (tiempoLimiteHoras) {
        formData.append('tiempoLimiteHoras', tiempoLimiteHoras);
      }
      if (intervaloRecordatorioMinutos) {
        formData.append('intervaloRecordatorioMinutos', intervaloRecordatorioMinutos);
      }

      let response;
      if (esNuevaVersion && documentoAnteriorId) {
        // Subir como nueva versión
        formData.append('mantenerPosiciones', 'false');
        response = await api.post(`/documentos/${documentoAnteriorId}/nueva-version`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      } else {
        // Subir como documento nuevo
        response = await api.post('/documentos/subir', formData, {
          headers: {
            'Content-Type': 'multipart/form-data'
          }
        });
      }

      if (response.data.success) {
        if (esNuevaVersion) {
          toast.success('Nueva versión subida exitosamente con las nuevas posiciones de firma');
          navigate(`/documento/${response.data.documentoId}`);
        } else {
          toast.success('Documento subido exitosamente con las posiciones de firma definidas');
          navigate('/dashboard');
        }
      }
    } catch (error) {
      console.error('Error al subir documento:', error);
      toast.error(error.response?.data?.message || 'Error al subir el documento');
    } finally {
      setLoading(false);
    }
  };

  if (!archivo) {
    return null;
  }

  return (
    <>
      <AppBar position="static">
        <Toolbar>
          <Button color="inherit" startIcon={<ArrowBack />} onClick={() => navigate('/subir-documento')}>
            Volver
          </Button>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            Definir Posiciones de Firmas
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
        </Alert>

        <Box sx={{ display: 'flex', gap: 3 }}>
          {/* Panel izquierdo - PDF */}
          <Box sx={{ flex: 1 }}>
            <Paper sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Documento: {archivo.name}
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
                  {aprobadoresConPosicion.map((aprobador, idx) => {
                    if (!aprobador.posicion || aprobador.posicion.pagina !== pageNumber) return null;
                    
                    const markerX = aprobador.posicion.x * escala;
                    const markerY = (dimensionesPagina.height - aprobador.posicion.y - aprobador.posicion.alto) * escala;
                    
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
                  Aprobadores ({aprobadoresConPosicion.filter(a => a.posicion).length}/{aprobadores.length})
                </Typography>

                <List>
                  {aprobadoresConPosicion.map((aprobador, index) => (
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
                                label={`Página ${aprobador.posicion.pagina}`}
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
                    onClick={handleSubmit}
                    disabled={loading || aprobadoresConPosicion.some(a => !a.posicion)}
                  >
                    {loading ? 'Subiendo...' : 'Confirmar y Subir Documento'}
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

export default DefinirPosicionesFirmas;
