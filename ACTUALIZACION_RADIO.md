# Actualización de música y programación

## Cambios

- Editor de biblioteca y orden de reproducción en dos paneles: arrastra una o varias pistas o una playlist completa, inserta entre pistas, cambia el orden, mezcla, elimina elementos y preescucha en el navegador. Incluye búsqueda, carpetas, duración total y tiempo acumulado. Conserva los botones como alternativa al arrastre.
- La preescucha NO se envía a la estación: usa exclusivamente el navegador.
- Arrastra shows en el calendario diario/semanal para cambiar hora/día; en el mensual se conserva la hora. Se mantiene la duración. Mover una repetición modifica únicamente esa emisión. Los shows superpuestos se muestran en columnas para poder seleccionarlos.
- Los contenidos agregados después de crear una serie también llegan a sus repeticiones. Editar contenido desde una repetición actualiza la plantilla y las emisiones que no han terminado. Las emisiones pasadas se conservan, salvo la plantilla y la emisión editada expresamente.
- La migración repara repeticiones antiguas vacías usando el contenido del original. Respeta las repeticiones antiguas que ya tienen contenido propio; la siguiente edición de contenido sincroniza las futuras.
- Dejar «Repetir hasta» vacío significa indefinidamente. El sistema genera una ventana móvil de 90 días y también los rangos consultados en el calendario: no termina a los 365 días. No necesita mantener infinitas filas en SQLite.
- Desde cualquier emisión: «Eliminar / cancelar» → «Solo esta emisión» o «Toda la serie». La cancelación individual deja un registro interno para impedir que el generador la vuelva a crear. Eliminar toda la serie elimina también la plantilla y todas sus repeticiones, incluidas las pasadas.
- Días específicos: 0=domingo, 6=sábado, coherente con la interfaz. La repetición mensual del día 31 usa el último día en meses cortos y vuelve al 31 cuando corresponde.
- Entre shows programados que se superponen gana el creado o movido más recientemente. Las repeticiones heredan la prioridad de su serie. «Go Live» conserva su prioridad manual sobre la programación automática.
- Fadeout predeterminado de 2 segundos antes de un cambio programado; consulta del reloj cada 250 ms. Si el cambio es imprevisto (edición/cancelación/activación manual), el fade comienza al detectarlo. El inicio audible también depende del decodificador y de los buffers de transmisión; no se garantiza sincronización a nivel de muestra.
- Al terminar un show superpuesto, vuelve el show que todavía tenga horario vigente, desde el inicio de su contenido; si no queda ninguno, vuelve el backup. No se implementa reanudación desde el segundo exacto interrumpido.
- Se conserva el comportamiento de recargar contenido editado durante una emisión; eso puede reiniciar su lista. No se cambió a una cola incremental de pistas ya emitidas.

Se implementan estos flujos de edición inspirados en LibreTime. Esto no convierte el proyecto en un clon completo de LibreTime ni agrega funciones no presentes como smart blocks, cue points o gestión de podcasts.

## Audio conservado

Se mantienen las fuentes scheduled/backup, Icecast (montaje, codificación, bitrate y credenciales), relé de transmisión, reproductor USB, ALSA, script de salida USB y archivos musicales. Los cambios de audio se limitan al fade solicitado, selección del show activo, recarga explícita y un único skip por cambio. El reproductor USB consulta la misma política de shows activos para respetar cancelaciones; su reproducción y dispositivo no cambian.

`liquidsoap/radio.liq` y `backend/scripts/radio_scheduler.py` se deben actualizar juntos. El archivo antiguo `liquidsoap.liq` de la raíz se conserva intacto, pero no es el script de programación que carga `liquidsoap/run.sh`.

## Aplicar el parche en la Raspberry

Utiliza `RadioStation_Parche.zip` para la instalación existente. Conserva la base de datos, media, backup, variables de entorno, dependencias y configuraciones locales. El ZIP completo contiene el proyecto fuente completo y las canciones del ZIP original; no contiene una nueva base de datos.

1. Descomprime el parche en una carpeta separada. Identifica cómo arrancan tus procesos y detén temporalmente backend, scheduler y Liquidsoap durante la migración. Los nombres de los servicios no están incluidos en el proyecto, por lo que no se inventan comandos de reinicio. Si usas systemd, puedes localizarlos con:

   ```bash
   systemctl list-units --type=service --all | grep -Ei 'radio|liquidsoap|gunicorn|daphne|react'
   ```

2. Desde la carpeta del parche ejecuta, con el usuario dueño del proyecto:

   ```bash
   python3 aplicar_actualizacion.py /home/radioadmin/radiostation-fixed
   ```

   El instalador verifica los archivos contra la versión que compartiste. Si un archivo local ya cambió, se detiene ANTES de copiar; no sobreescribe esas modificaciones. Crea una carpeta de respaldo junto al proyecto e imprime su ruta. Respalda también `backend/db.sqlite3` con la API de SQLite. No elimina carpetas, audio ni variables de entorno. Si tu ruta es distinta, úsala como argumento.

3. Aplica la migración y comprueba el backend con el Python de tu entorno existente:

   ```bash
   cd /home/radioadmin/radiostation-fixed/backend
   ./venv/bin/python manage.py migrate
   ./venv/bin/python manage.py check
   ./venv/bin/python manage.py test api.tests
   ```

   Si tu entorno tiene otro nombre, cambia `./venv/bin/python`. No ejecutes `makemigrations`: ya se incluye `0003_show_series.py`.

4. Comprueba Liquidsoap con el mismo usuario/entorno del servicio:

   ```bash
   liquidsoap --version
   liquidsoap --check /home/radioadmin/radiostation-fixed/liquidsoap/radio.liq
   ```

   Se comprobó con Liquidsoap 2.2.4. Si la versión instalada rechaza el script, conserva el respaldo y resuelve la compatibilidad antes de arrancar el scheduler actualizado. Las advertencias de sintaxis antigua de referencias en 2.2.4 no impiden ejecutar el script.

5. Compila el frontend usando su configuración de producción existente:

   ```bash
   cd /home/radioadmin/radiostation-fixed/frontend
   npm ci
   npm run build
   ```

   Se conserva `package-lock.json` original y no se agregan dependencias. El frontend usa tu `REACT_APP_API_URL` existente; sin configurarla, el valor predeterminado del proyecto sigue siendo `http://localhost:8001/api`. Sirve `build/` con tu despliegue actual; si usas `npm start`, reinicia ese proceso.

6. Reinicia los mismos procesos/servicios que detuviste. Comprueba una playlist, una serie y un empalme de prueba. Revisa `logs/scheduler.log` y `logs/liquidsoap.log`. El scheduler registra los cambios de show y reintenta si Liquidsoap aún no está disponible.

Para ajustar el fade, establece `RADIO_FADE_SECONDS=2` en el entorno del proceso scheduler (segundos). No es necesario modificar el script de Liquidsoap para cambiar la duración.

## Restauración

Detén los mismos procesos. Desde el parche:

```bash
python3 aplicar_actualizacion.py --restore /ruta/exacta/del/respaldo/impresa
```

Restaura código y la copia de SQLite tomada antes de la actualización. Esto también descarta los cambios de programación hechos después de ese respaldo. Vuelve a compilar el frontend anterior y reinicia tus procesos habituales. El respaldo no modifica ni restaura archivos musicales.

## Verificación realizada

- 12 pruebas Django: creación y sincronización de contenido, edición desde hijos, cancelación individual, eliminación de serie, movimientos sin duplicar slots, generación lejana, días de semana, fin de mes, prioridad, orden transaccional y transiciones.
- 6 pruebas React: inserción de varias pistas en posición específica, inserción de playlists, reordenamiento por ID de elemento, rechazo de arrastres inválidos, error de guardado y preservación de duración al mover un show que cruza medianoche.
- Build de producción del frontend y comprobaciones de modelos/migraciones Django.
- Comprobación de script y prueba sonora local con Liquidsoap 2.2.4: señal de 440 Hz → fade de 2 s → recarga y un solo skip → señal de 880 Hz. Se verificó descenso de amplitud y frecuencia de la señal entrante, usando salida WAV de prueba; no se conectó a la transmisión real.

La Raspberry, sus dispositivos USB y la transmisión de producción no se han operado desde esta sesión.

Referencias de comportamiento: https://libretime.org/docs/user-manual/playlists/ y https://libretime.org/docs/user-manual/dashboard/ .
