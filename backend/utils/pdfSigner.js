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

    // Convertir el nombre a mayúsculas
    const usuarioNombreMayusculas = usuarioNombre.toUpperCase();
    
    const font = await pdfDoc.embedFont('Helvetica-Bold');
    
    // Función para dividir texto en líneas que quepan en el ancho disponible
    // Las palabras nunca se cortan, siempre se pasan completas a la siguiente línea
    // Si una palabra es muy larga, se divide en caracteres para que quepa
    const dividirEnLineas = (texto, anchoMaximo, tamanoFuente) => {
      const palabras = texto.split(' ');
      const lineas = [];
      let lineaActual = '';
      
      for (const palabra of palabras) {
        // Verificar si la palabra sola cabe en el ancho disponible
        let anchoPalabra = font.widthOfTextAtSize(palabra, tamanoFuente);
        
        // Si la palabra sola no cabe, dividirla en caracteres
        if (anchoPalabra > anchoMaximo) {
          // Si ya hay contenido en la línea actual, guardarlo
          if (lineaActual) {
            lineas.push(lineaActual);
            lineaActual = '';
          }
          
          // Dividir la palabra en caracteres para que quepa
          let palabraRestante = palabra;
          while (palabraRestante.length > 0) {
            let caracteresEnLinea = '';
            for (let i = 0; i < palabraRestante.length; i++) {
              const prueba = caracteresEnLinea + palabraRestante[i];
              const anchoPrueba = font.widthOfTextAtSize(prueba, tamanoFuente);
              if (anchoPrueba <= anchoMaximo) {
                caracteresEnLinea = prueba;
              } else {
                break;
              }
            }
            
            if (caracteresEnLinea.length > 0) {
              lineas.push(caracteresEnLinea);
              palabraRestante = palabraRestante.substring(caracteresEnLinea.length);
            } else {
              // Si ni un solo carácter cabe, forzar al menos uno
              lineas.push(palabraRestante[0]);
              palabraRestante = palabraRestante.substring(1);
            }
          }
          continue;
        }
        
        // Intentar agregar la palabra a la línea actual
        const textoPrueba = lineaActual ? `${lineaActual} ${palabra}` : palabra;
        const anchoTexto = font.widthOfTextAtSize(textoPrueba, tamanoFuente);
        
        if (anchoTexto <= anchoMaximo) {
          // Cabe en la línea actual
          lineaActual = textoPrueba;
        } else {
          // No cabe, guardar la línea actual y empezar una nueva con esta palabra
          if (lineaActual) {
            lineas.push(lineaActual);
          }
          lineaActual = palabra;
        }
      }
      
      // Agregar la última línea si tiene contenido
      if (lineaActual) {
        lineas.push(lineaActual);
      }
      
      return lineas.length > 0 ? lineas : [texto];
    };
    
    // Calcular tamaño de fuente inicial
    let fontSize = Math.min(alto * 0.35, 24); // Máximo 24pt
    const anchoDisponible = ancho * 0.95; // 95% del ancho para margen
    const altoDisponible = alto * 0.9; // 90% del alto para margen
    let espacioEntreLineas = fontSize * 1.2; // Espacio entre líneas (120% del tamaño de fuente)
    
    let lineas = [];
    let alturaTotal = 0;
    let intentos = 0;
    const minFontSize = 6; // Tamaño mínimo más pequeño para nombres muy largos
    
    // Iterar hasta encontrar un tamaño que quepa tanto en ancho como en alto
    while (intentos < 100 && fontSize >= minFontSize) {
      lineas = dividirEnLineas(usuarioNombreMayusculas, anchoDisponible, fontSize);
      
      // Verificar que todas las líneas quepan en el ancho (con un pequeño margen de error)
      let todasCabenEnAncho = true;
      for (const linea of lineas) {
        const anchoLinea = font.widthOfTextAtSize(linea, fontSize);
        if (anchoLinea > anchoDisponible * 1.01) { // 1% de tolerancia
          todasCabenEnAncho = false;
          break;
        }
      }
      
      // Calcular altura total necesaria
      alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
      
      // Si todas las líneas caben en ancho y alto, usar este tamaño
      if (todasCabenEnAncho && alturaTotal <= altoDisponible) {
        break;
      }
      
      // Reducir tamaño de fuente y recalcular
      fontSize -= 0.3;
      espacioEntreLineas = fontSize * 1.2;
      intentos++;
    }
    
    // Si aún no cabe en alto después de todos los intentos, forzar a que quepa
    if (alturaTotal > altoDisponible && fontSize > minFontSize) {
      // Calcular el tamaño máximo que cabe en el alto disponible
      const maxLineas = Math.max(1, Math.floor(altoDisponible / (fontSize * 1.2)));
      if (lineas.length > maxLineas) {
        // Si hay demasiadas líneas, reducir más el tamaño
        fontSize = Math.max(minFontSize, (altoDisponible / (lineas.length * 1.2)));
        espacioEntreLineas = fontSize * 1.2;
        // Recalcular líneas con el nuevo tamaño
        lineas = dividirEnLineas(usuarioNombreMayusculas, anchoDisponible, fontSize);
      }
      // Recalcular altura total con las nuevas líneas
      alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
      
      // Asegurar que no exceda el alto disponible
      if (alturaTotal > altoDisponible) {
        fontSize = Math.max(minFontSize, (altoDisponible / (lineas.length * 1.2)));
        espacioEntreLineas = fontSize * 1.2;
        alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
      }
    }
    
    // Asegurar que tenemos líneas y un tamaño de fuente válido
    if (!lineas || lineas.length === 0 || fontSize < minFontSize) {
      console.error('Error: No se pudieron generar líneas válidas o el tamaño de fuente es muy pequeño');
      lineas = [usuarioNombreMayusculas];
      fontSize = Math.max(minFontSize, Math.min(alto * 0.2, ancho / usuarioNombreMayusculas.length * 1.5));
      alturaTotal = fontSize;
      espacioEntreLineas = fontSize * 1.2;
    }
    
    // Asegurar que el texto no se salga del área delimitada
    // Verificar una última vez que todas las líneas quepan
    const lineasFinales = [];
    for (const linea of lineas) {
      const anchoLinea = font.widthOfTextAtSize(linea, fontSize);
      if (anchoLinea <= anchoDisponible) {
        lineasFinales.push(linea);
      } else {
        // Si aún no cabe, dividir en caracteres
        let textoRestante = linea;
        while (textoRestante.length > 0) {
          let caracteresEnLinea = '';
          for (let i = 0; i < textoRestante.length; i++) {
            const prueba = caracteresEnLinea + textoRestante[i];
            const anchoPrueba = font.widthOfTextAtSize(prueba, fontSize);
            if (anchoPrueba <= anchoDisponible) {
              caracteresEnLinea = prueba;
            } else {
              break;
            }
          }
          if (caracteresEnLinea.length > 0) {
            lineasFinales.push(caracteresEnLinea);
            textoRestante = textoRestante.substring(caracteresEnLinea.length);
          } else {
            lineasFinales.push(textoRestante[0] || '');
            textoRestante = textoRestante.substring(1);
          }
        }
      }
    }
    lineas = lineasFinales;
    
    // Recalcular altura total con las líneas finales
    alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
    
    // Asegurar que la altura total no exceda el alto disponible
    if (alturaTotal > altoDisponible) {
      fontSize = Math.max(minFontSize, (altoDisponible / (lineas.length * 1.2)));
      espacioEntreLineas = fontSize * 1.2;
      alturaTotal = (lineas.length * fontSize) + ((lineas.length - 1) * (espacioEntreLineas - fontSize));
    }
    
    // Calcular posición centrada verticalmente
    // Y en PDF es desde abajo, así que calculamos desde la parte inferior del recuadro
    const espacioVerticalRestante = alto - alturaTotal;
    const margenSuperior = Math.max(0, espacioVerticalRestante / 2);
    const textYInicial = y + alto - margenSuperior - fontSize; // Posición de la primera línea desde abajo
    
    // Asegurar que el texto no se salga por arriba o abajo
    const textYMinimo = y; // Límite inferior
    const textYMaximo = y + alto - fontSize; // Límite superior
    
    // Dibujar cada línea centrada horizontalmente
    lineas.forEach((linea, index) => {
      if (!linea || linea.trim() === '') return; // Saltar líneas vacías
      
      const textWidth = font.widthOfTextAtSize(linea, fontSize);
      // Asegurar que el texto no se salga horizontalmente
      const textX = Math.max(x, Math.min(x + ancho - textWidth, x + (ancho - textWidth) / 2));
      
      // Para cada línea subsiguiente, subimos espacioEntreLineas
      let textY = textYInicial - (index * espacioEntreLineas);
      
      // Asegurar que el texto no se salga verticalmente
      textY = Math.max(textYMinimo, Math.min(textYMaximo, textY));
      
      page.drawText(linea, {
        x: textX,
        y: textY,
        size: fontSize,
        font: font,
        color: rgb(0, 0, 0.6), // Azul oscuro
      });
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

      lastPage.drawText(`Firmado por: ${firma.usuario_nombre.toUpperCase()}`, {
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
      auditoriaPage.drawText(`${index + 1}. ${firma.usuario_nombre.toUpperCase()} - ${fechaFirma}`, {
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
