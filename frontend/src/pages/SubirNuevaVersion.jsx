import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Container, Box, Typography, Button, Paper, AppBar, Toolbar,
  TextField, Alert, RadioGroup, FormControlLabel, Radio, FormControl, FormLabel
} from '@mui/material';
import { ArrowBack, CloudUpload, Edit, Check } from '@mui/icons-material';
import { toast } from 'react-toastify';
import api from '../config/axios';

const SubirNuevaVersion = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [documento, setDocumento] = useState(null);
  const [archivo, setArchivo] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [loading, setLoading] = useState(false);
  const [aprobadoresOriginales, setAprobadoresOriginales] = useState([]);
  const [mantenerPosiciones, setMantenerPosiciones] = useState('true');

  useEffect(() => {
    cargarDocumento();
  }, [id]);

  const cargarDocumento = async () => {
    try {
      const response = await api.get(`/documentos/${id}`);
      const doc = response.data.documento;
      setDocumento(doc);
      setDescripcion(doc.descripcion);

      // Obtener aprobadores originales
      const aprobadoresResponse = await api.get(`/documentos/${id}/aprobadores`);
      setAprobadoresOriginales(aprobadoresResponse.data.aprobadores || []);
    } catch (error) {
      console.error('Error al cargar documento:', error);
      toast.error('Error al cargar el documento');
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

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!archivo) {
      toast.error('Debes seleccionar un archivo PDF');
      return;
    }

    if (!descripcion.trim()) {
      toast.error('Debes agregar una descripción');
      return;
    }

    // Si el usuario eligió cambiar posiciones, navegar a DefinirPosicionesFirmas
    if (mantenerPosiciones === 'false') {
      const aprobadoresData = aprobadoresOriginales.map(a => ({
        id: a.usuario_id,
        usuarioId: a.usuario_id,
        nombre: a.usuario_nombre,
        correo: a.usuario_correo,
        rol: a.rol_aprobacion,
        correoGrupo: a.correo_grupo ?? null,
        grupoMiembroId: a.grupo_miembro_id ?? null
      }));

      navigate('/definir-posiciones', {
        state: {
          archivo,
          tipoDocumento: documento.tipo_documento,
          descripcion,
          aprobadores: aprobadoresData,
          esNuevaVersion: true,
          documentoAnteriorId: id
        }
      });
      return;
    }

    // Si mantiene posiciones, subir directamente
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append('documento', archivo);
      formData.append('mantenerPosiciones', 'true');

      // Subir nueva versión con historial
      const response = await api.post(`/documentos/${id}/nueva-version`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      if (response.data.success) {
        toast.success('Nueva versión subida exitosamente');
        // Navegar al nuevo documento creado
        navigate(`/documento/${response.data.documentoId}`);
      }
    } catch (error) {
      console.error('Error al subir nueva versión:', error);
      toast.error(error.response?.data?.message || 'Error al subir la nueva versión');
    } finally {
      setLoading(false);
    }
  };

  if (!documento) {
    return (
      <Container>
        <Box sx={{ mt: 4, textAlign: 'center' }}>
          <Typography>Cargando...</Typography>
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
            Subir Nueva Versión
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ mt: 4, mb: 4 }}>
        <Paper elevation={3} sx={{ p: 4 }}>
          <Typography variant="h4" gutterBottom>
            Nueva Versión del Documento
          </Typography>

          <Alert severity="info" sx={{ mb: 3 }}>
            Esta nueva versión mantendrá el historial del documento. Solo se notificará a quienes no aprobaron la versión anterior.
          </Alert>

          <Box sx={{ mb: 3 }}>
            <Typography variant="body1">
              <strong>Documento original:</strong> {documento.nombre_archivo}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Versión actual:</strong> {documento.version}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              <strong>Nueva versión:</strong> {documento.version + 1}
            </Typography>
          </Box>

          <Box sx={{ mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Aprobadores (se mantendrán los mismos):
            </Typography>
            <ul>
              {aprobadoresOriginales.map((aprobador, idx) => (
                <li key={idx}>
                  {aprobador.usuario_nombre} ({aprobador.usuario_correo}) - 
                  <strong> {aprobador.estado === 'aprobado' ? ' ✓ Ya aprobó' : ' Pendiente'}</strong>
                </li>
              ))}
            </ul>
          </Box>

          <form onSubmit={handleSubmit}>
            <Box sx={{ mb: 3 }}>
              <Button
                variant="outlined"
                component="label"
                fullWidth
                startIcon={<CloudUpload />}
                sx={{ py: 2 }}
              >
                {archivo ? archivo.name : 'Seleccionar nuevo archivo PDF'}
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
            </Box>

            <Box sx={{ mb: 3 }}>
              <TextField
                fullWidth
                required
                multiline
                rows={4}
                label="Descripción de los cambios"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                placeholder="Describe qué cambios se realizaron en esta nueva versión..."
              />
            </Box>

            <Box sx={{ mb: 3 }}>
              <FormControl component="fieldset">
                <FormLabel component="legend">Posiciones de Firma</FormLabel>
                <RadioGroup
                  value={mantenerPosiciones}
                  onChange={(e) => setMantenerPosiciones(e.target.value)}
                >
                  <FormControlLabel
                    value="true"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Check />
                        <Typography>Mantener las posiciones de firma actuales</Typography>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="false"
                    control={<Radio />}
                    label={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Edit />
                        <Typography>Redefinir posiciones de firma</Typography>
                      </Box>
                    }
                  />
                </RadioGroup>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <Button
                variant="outlined"
                onClick={() => navigate(`/documento/${id}`)}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={loading || !archivo}
              >
                {loading ? 'Subiendo...' : mantenerPosiciones === 'true' ? 'Subir Nueva Versión' : 'Continuar a Definir Posiciones'}
              </Button>
            </Box>
          </form>
        </Paper>
      </Container>
    </>
  );
};

export default SubirNuevaVersion;
