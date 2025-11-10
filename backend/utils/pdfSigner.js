import { PDFDocument, rgb } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

/**
 * Inserta el nombre del usuario en un PDF como firma
 * @param {string} pdfPath - Ruta del PDF original
 * @param {string} firmaBase64 - No usado (mantener compatibilidad)
 * @param {object} opciones - Opciones de posición y tamaño
 * @returns {Promise<Buffer>} - Buffer del PDF con el nombre
 */
export async function insertarFirmaEnPDF(pdfPath, firmaBase64, opciones = {}) {
  try {
    // Leer el PDF existente
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Opciones por defecto
    const {
      pagina = -1, // -1 significa última página
      x = 50,
      y = 50,
      ancho = 200,
      alto = 100,
      usuarioNombre = '',
      fechaFirma = new Date()
    } = opciones;

    // Obtener la página donde se insertará el nombre
    const pageIndex = pagina === -1 ? pdfDoc.getPageCount() - 1 : pagina - 1;
    const page = pdfDoc.getPage(pageIndex);

    // Calcular tamaño de fuente dinámico basado en el espacio disponible
    // Comenzamos con un tamaño base y lo ajustamos si es necesario
    let fontSize = Math.min(alto * 0.35, 24); // Máximo 24pt
    const font = await pdfDoc.embedFont('Helvetica-Bold');
    
    // Medir el ancho del texto con el tamaño actual
    let textWidth = font.widthOfTextAtSize(usuarioNombre, fontSize);
    
    // Ajustar el tamaño si el texto es muy ancho
    while (textWidth > ancho * 0.95 && fontSize > 8) {
      fontSize -= 0.5;
      textWidth = font.widthOfTextAtSize(usuarioNombre, fontSize);
    }
    
    // Calcular posición centrada
    const textHeight = fontSize;
    const textX = x + (ancho - textWidth) / 2;
    const textY = y + (alto - textHeight) / 2;
    
    // Dibujar el nombre del usuario centrado en el espacio
    page.drawText(usuarioNombre, {
      x: textX,
      y: textY,
      size: fontSize,
      font: font,
      color: rgb(0, 0, 0.6), // Azul oscuro
    });

    // Guardar el PDF modificado
    const pdfBytesModified = await pdfDoc.save();
    return Buffer.from(pdfBytesModified);

  } catch (error) {
    console.error('Error al insertar nombre en PDF:', error);
    throw error;
  }
}

/**
 * Inserta múltiples firmas en un PDF
 * @param {string} pdfPath - Ruta del PDF original
 * @param {Array} firmas - Array de objetos con datos de firmas
 * @returns {Promise<Buffer>} - Buffer del PDF con todas las firmas
 */
export async function insertarMultiplesFirmasEnPDF(pdfPath, firmas) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    const pageCount = pdfDoc.getPageCount();
    const lastPage = pdfDoc.getPage(pageCount - 1);

    // Calcular posiciones automáticas para las firmas
    const firmasPorFila = 2;
    const anchoFirma = 180;
    const altoFirma = 90;
    const margenX = 50;
    const margenY = 50;
    const espacioEntreFilas = 130;
    const espacioEntreColumnas = 250;

    for (let i = 0; i < firmas.length; i++) {
      const firma = firmas[i];
      const fila = Math.floor(i / firmasPorFila);
      const columna = i % firmasPorFila;

      const x = margenX + (columna * espacioEntreColumnas);
      const y = lastPage.getHeight() - margenY - (fila * espacioEntreFilas) - altoFirma;

      // Convertir firma base64 a imagen
      const firmaImagenData = firma.firma_base64.replace(/^data:image\/png;base64,/, '');
      const firmaImagen = await pdfDoc.embedPng(Buffer.from(firmaImagenData, 'base64'));

      // Dibujar firma
      lastPage.drawImage(firmaImagen, {
        x: x,
        y: y,
        width: anchoFirma,
        height: altoFirma,
      });

      // Agregar información de la firma
      const fontSize = 8;
      const fechaTexto = new Date(firma.fecha_firma).toLocaleString('es-MX', { 
        dateStyle: 'short', 
        timeStyle: 'short' 
      });

      lastPage.drawText(`Firmado por: ${firma.usuario_nombre}`, {
        x: x,
        y: y - 12,
        size: fontSize,
        color: rgb(0, 0, 0),
      });

      lastPage.drawText(`Fecha: ${fechaTexto}`, {
        x: x,
        y: y - 22,
        size: fontSize,
        color: rgb(0.3, 0.3, 0.3),
      });
    }

    // Guardar el PDF modificado
    const pdfBytesModified = await pdfDoc.save();
    return Buffer.from(pdfBytesModified);

  } catch (error) {
    console.error('Error al insertar múltiples firmas en PDF:', error);
    throw error;
  }
}

/**
 * Agrega una página de auditoría al final del PDF con todas las firmas
 */
export async function agregarPaginaAuditoria(pdfPath, firmas, documentoInfo) {
  try {
    const pdfBytes = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Agregar nueva página para auditoría
    const auditoriaPage = pdfDoc.addPage();
    const { width, height } = auditoriaPage.getSize();

    // Título
    auditoriaPage.drawText('REGISTRO DE FIRMAS Y AUDITORÍA', {
      x: 50,
      y: height - 50,
      size: 16,
      color: rgb(0, 0, 0),
    });

    // Información del documento
    auditoriaPage.drawText(`Documento: ${documentoInfo.nombre_archivo}`, {
      x: 50,
      y: height - 80,
      size: 10,
      color: rgb(0, 0, 0),
    });

    auditoriaPage.drawText(`Fecha de creación: ${new Date(documentoInfo.fecha_creacion).toLocaleString('es-MX')}`, {
      x: 50,
      y: height - 95,
      size: 10,
      color: rgb(0, 0, 0),
    });

    auditoriaPage.drawText(`Versión: ${documentoInfo.version}`, {
      x: 50,
      y: height - 110,
      size: 10,
      color: rgb(0, 0, 0),
    });

    // Listar firmas
    let yPosition = height - 150;
    auditoriaPage.drawText('Firmas registradas:', {
      x: 50,
      y: yPosition,
      size: 12,
      color: rgb(0, 0, 0),
    });

    yPosition -= 25;
    firmas.forEach((firma, index) => {
      const fechaFirma = new Date(firma.fecha_firma).toLocaleString('es-MX');
      auditoriaPage.drawText(`${index + 1}. ${firma.usuario_nombre} - ${fechaFirma}`, {
        x: 70,
        y: yPosition,
        size: 9,
        color: rgb(0, 0, 0),
      });
      yPosition -= 20;
    });

    // Guardar el PDF con la página de auditoría
    const pdfBytesModified = await pdfDoc.save();
    return Buffer.from(pdfBytesModified);

  } catch (error) {
    console.error('Error al agregar página de auditoría:', error);
    throw error;
  }
}
