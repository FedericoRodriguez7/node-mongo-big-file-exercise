const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const Records = require('./records.model');

const upload = async (req, res) => {
    const { file } = req;

    // Validación, si no hay archivo responde con error
    if (!file) {
        return res.status(400).json({ message: 'No se subió ningún archivo.' });
    }

    // Ruta absoluta al archivo subido en la carpeta _temp
    const filePath = path.join(__dirname, '..', '_temp', file.filename);

    // Pruebas para ver velocidad y rendimiento de procesamiento de archivos
    const batchSize = Number(process.env.BATCH_SIZE) || 1000;

    let batch = [];
    let totalInserted = 0;
    let batchCount = 0;

    const startTime = Date.now();
    console.log('Inicio procesamiento archivo:', new Date(startTime).toLocaleString());
    console.log(`Batch size configurado: ${batchSize}`);

    try {
        // Se crea un stream de lectura del CSV en modo "pipeline" para no cargar todo en RAM
        const stream = fs.createReadStream(filePath).pipe(csv());

        // Iteración línea por línea del archivo CSV (modo asincrónico y eficiente)
        for await (const record of stream) {
            // Parseo y push al batch actual
            batch.push({
                id: Number(record.id),
                firstname: record.firstname,
                lastname: record.lastname,
                email: record.email,
                email2: record.email2,
                profession: record.profession,
            });

            // Si el batch alcanza el tamaño definido, se inserta en MongoDB
            if (batch.length >= batchSize) {
                batchCount++;
                const batchStart = Date.now();
                await Records.insertMany(batch, { ordered: false });
                totalInserted += batch.length;
                batch = [];
                const batchEnd = Date.now();
                console.log(`Insertado batch #${batchCount} de ${batchSize} registros en ${(batchEnd - batchStart)} ms`);
            }
        }

        // Si quedaron registros sueltos (último batch), también se insertan
        if (batch.length > 0) {
            batchCount++;
            const batchStart = Date.now();
            await Records.insertMany(batch, { ordered: false });
            totalInserted += batch.length;
            const batchEnd = Date.now();
            console.log(`Insertado último batch #${batchCount} de ${batch.length} registros en ${(batchEnd - batchStart)} ms`);
        }

        fs.unlinkSync(filePath);

        const endTime = Date.now();
        console.log('Fin procesamiento archivo:', new Date(endTime).toLocaleString());
        console.log(`Tiempo total de procesamiento: ${(endTime - startTime)} ms`);
        console.log(`Total registros insertados: ${totalInserted}`);
        console.log(`Total batches procesados: ${batchCount}`);

        // Respuesta final al cliente
        return res.status(200).json({
            message: `Archivo procesado con éxito. Registros insertados: ${totalInserted}`,
            tiempoProcesamientoMs: endTime - startTime,
            totalBatches: batchCount,
            batchSize,
        });
    } catch (err) {
        // Manejo de errores general
        console.error('Error al procesar archivo:', err);
        return res.status(500).json({
            message: 'Error al procesar archivo.',
            error: err.message,
        });
    }
};

const list = async (_, res) => {
    try {
        const data = await Records
            .find({})
            .limit(10)
            .lean();

        return res.status(200).json(data);
    } catch (err) {
        return res.status(500).json(err);
    }
};

module.exports = {
    upload,
    list,
};
