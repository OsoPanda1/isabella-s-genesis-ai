import { useState } from "react";
import {
  Sparkles,
  Search,
  LayoutTemplate,
  Monitor,
  Volume2,
  Code2,
  Palette,
  Compass,
  CheckCircle2,
  ArrowUpRight,
  MousePointerClick,
  Info,
} from "lucide-react";

interface AiPlatform {
  id: string;
  name: string;
  provider: string;
  category:
    "Generales & Chat" | "Código & Desarrollo" | "Diseño & Video" | "Audio & Voz" | "Productividad";
  description: string;
  features: string[];
}

const AI_PLATFORMS: AiPlatform[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    provider: "OpenAI",
    category: "Generales & Chat",
    description:
      "La plataforma conversacional de referencia mundial, pionera en interfaces adaptativas.",
    features: [
      "Lienzo (Canvas): Panel lateral para editar código o texto de forma interactiva y en tiempo real sin perder el hilo del chat.",
      "Modo de Voz en Vivo: Interfaz de audio fluida e hiperrealista con animaciones visuales dinámicas según el tono de la interacción.",
      "Barra de navegación de GPTs y Proyectos: Menú lateral accesible para alternar entre asistentes personalizados e hilos de trabajo organizados.",
      "Inspector de archivos y hojas de cálculo: Visores integrados para previsualizar tablas, gráficos interactivos y PDFs adjuntos.",
      "Diseño centrado en la conversación: Panel limpio y minimalista con soporte nativo de modo oscuro/claro y atajos de teclado rápidos.",
    ],
  },
  {
    id: "gemini",
    name: "Google Gemini",
    provider: "Google",
    category: "Generales & Chat",
    description:
      "Asistente de IA multimodal e inteligente, profundamente integrado con la suite de Google.",
    features: [
      "Integración nativa con Google Workspace: Botones directos para exportar contenidos a Google Docs, Gmail, Sheets o Drive con un solo clic.",
      "Canvas multimodal de imágenes y video: Previsualización dinámica de imágenes y contenido multimedia dentro del flujo de la pantalla.",
      "Modo Deep Research: Panel de desglose paso a paso que muestra las fuentes y el árbol de razonamiento en tiempo real.",
      "Respuestas comparativas: Interfaz desplegable para alternar rápidamente entre diferentes versiones (Drafts) de la respuesta.",
      "Verificación de fuentes (Double-Check): Resaltado en color sobre el texto para verificar directamente los enlaces en la web.",
    ],
  },
  {
    id: "claude",
    name: "Claude",
    provider: "Anthropic",
    category: "Generales & Chat",
    description:
      "Famoso por su razonamiento avanzado, tono empático y la innovadora vista de artefactos.",
    features: [
      "Artifacts (Artefactos): Ventana dividida dedicada a visualizar aplicaciones web, código formateado, documentos o diagramas al lado de la charla.",
      "Proyectos y Knowledge Base: Panel visual para arrastrar carpetas enteras de contexto y consultar documentación extensiva.",
      "Tipografía y lectura pensada para humanos: Diseño editorial con alta legibilidad para documentos de largo alcance.",
      "Controlador de Token Context: Indicador claro del uso de memoria en conversaciones extensas.",
      "Selector de modelos rápido: Menú desplegable intuitivo para cambiar la velocidad y profundidad del modelo sin perder la vista actual.",
    ],
  },
  {
    id: "perplexity",
    name: "Perplexity AI",
    provider: "Perplexity",
    category: "Productividad",
    description:
      "Motor de búsqueda y respuestas potenciado por IA que redefine la investigación online.",
    features: [
      "Diseño al estilo motor de respuesta: Interfaz limpia estructurada en tarjetas con citas web numeradas y verificables.",
      "Colecciones (Spaces): Espacios visuales para organizar hilos de investigación con archivos compartidos y prompts base.",
      "Visualizador de hilos de seguimiento: Sugerencia inteligente de preguntas secundarias organizadas en bloques interactivos.",
      "Panel de fuentes multimedia: Módulo dedicado a mostrar videos de YouTube, imágenes y tablas explicativas junto a la respuesta escrita.",
      "Soporte multimodelo interactivo: Módulo de búsqueda donde se puede conmutar qué modelo procesa la consulta actual.",
    ],
  },
  {
    id: "midjourney",
    name: "Midjourney",
    provider: "Midjourney Inc.",
    category: "Diseño & Video",
    description:
      "El motor de generación de imágenes artísticas más aclamado con su propia plataforma web alpha.",
    features: [
      "Página Alpha Web: Lienzo con galerías infinitas, filtros de búsqueda y opciones de creación en la misma pantalla.",
      "Controles visuales de Varianza y Upscale: Modificadores en botón directo para reescalar, rehacer zonas (Inpainting) o extender bordes (Outpainting).",
      "Editores con herramientas de selección: Pincel dentro del navegador para aislar áreas específicas de la imagen a modificar.",
      "Lienzo de inspiración colaborativo: Pestaña de exploración interactiva con visualizador del prompt exacto y parámetros de otros usuarios.",
      "Parámetros en Sliders: Ajustadores deslizantes visuales para aspecto de imagen, nivel de caos y estilo, evitando memorizar comandos escritos.",
    ],
  },
  {
    id: "cursor",
    name: "Cursor",
    provider: "Anysphere",
    category: "Código & Desarrollo",
    description:
      "El editor de código de IA de próxima generación construido sobre la base de VS Code.",
    features: [
      "IDE basado en VS Code: Entorno familiar con capacidades de IA integradas directamente en el código fuente.",
      "Edición en múltiples archivos (Composer): Panel flotante para crear y modificar estructuras compuestas de varios archivos simultáneamente.",
      "Diffs inline claros: Comparación en rojo/verde de código generado frente al existente para aceptar o rechazar con una tecla.",
      "Chat contextualmente indexado: Selector interactivo usando @ para invocar archivos, docs, commits o la base de código completa.",
      "Predicción de cursor en tiempo real: Autocompletado multinínea presentado en texto gris tenue con flujo de código predictivo.",
    ],
  },
  {
    id: "copilot",
    name: "Microsoft Copilot",
    provider: "Microsoft",
    category: "Generales & Chat",
    description:
      "Tu compañero diario de inteligencia integrado directamente en Windows y MS Office.",
    features: [
      "Integración en barra lateral (Windows / Office): Interfaz emergente lateral sin interrumpir la app en uso (Word, Excel, Edge).",
      "Notebook Mode: Lienzo libre de texto a la izquierda y resultados a la derecha para iterar instrucciones complejas.",
      "Creador de imágenes integrado (Copilot Designer): Tarjetas interactivas para modificar estilos artísticos de imágenes generadas sobre la marcha.",
      "Tarjetas funcionales interactivas: Respuestas con widgets interactivos para clima, viajes, cotizaciones y vuelos.",
      "Selector de tonos de respuesta: Botones directos para fijar la interfaz en estilo Creativo, Preciso o Balanceado.",
    ],
  },
  {
    id: "canva",
    name: "Canva Magic Studio",
    provider: "Canva",
    category: "Diseño & Video",
    description:
      "Conjunto completo de herramientas de diseño enriquecidas con flujos creativos con IA.",
    features: [
      "Lienzo de edición WYSIWYG: Entorno de diseño gráfico de 'arrastrar y soltar' accesible para no diseñadores.",
      "Magic Switch: Menú desplegable para transformar formatos (ej. convertir una presentación en un post de redes o un blog) al instante.",
      "Pincel de edición mágica: Herramienta para marcar objetos en el canvas y reemplazarlos mediante prompts de texto.",
      "Barra de tiempo multicanal: Interfaz intuitiva para sincronizar animaciones e imágenes creadas por IA en proyectos de video.",
      "Generación en lote (Bulk Create): Tablas de datos conectadas a plantillas para personalizar contenido en masa visualmente.",
    ],
  },
  {
    id: "runway",
    name: "Runway Gen-3/Gen-4",
    provider: "Runway",
    category: "Diseño & Video",
    description:
      "Líder en generación de video por IA y efectos visuales de calidad cinematográfica.",
    features: [
      "Motion Brush: Herramienta de pincel para pintar en qué dirección exacta deben moverse partes específicas de la imagen.",
      "Línea de tiempo de video avanzada: Editor de pistas estilo software profesional (estilo Premiere) accesible desde el navegador.",
      "Controles de cámara virtuales: Selectores para pan, zoom, rotación y velocidad del movimiento de la cámara sobre la escena.",
      "Previas en miniatura rápidas: Galería de resultados en renderizado previo para comparar tomas antes de generar en alta definición.",
      "Interfaz de entrenamiento personalizada: Panel intuitivo para subir conjuntos de datos e imágenes para entrenar estilos propios.",
    ],
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    provider: "ElevenLabs",
    category: "Audio & Voz",
    description:
      "Motor de síntesis, efectos de sonido y clonación de voz por IA con la más alta fidelidad.",
    features: [
      "Editor de voz en bloque: Espacio para pegar guiones largos e interactuar asignando voces distintas a cada párrafo o personaje.",
      "Sound Effects Studio: Interfaz rápida con barras de tiempo para previsualizar y ajustar efectos de sonido generados por texto.",
      "Laboratorio de Clonación: Asistente paso a paso con analizador de calidad de audio para subir muestras y validar tonos.",
      "Ajustadores de voz (Sliders): Controles visuales para estabilidad, claridad, exageración del estilo y variabilidad emocional.",
      "Dubbing Studio: Panel multipista con alineación de audio y traducción de idioma con sincronización de labios.",
    ],
  },
  {
    id: "notion",
    name: "Notion AI",
    provider: "Notion",
    category: "Productividad",
    description:
      "Socio de redacción, organización y síntesis profundamente embebido en tu espacio de trabajo Notion.",
    features: [
      "Inserción contextual inline: Menú emergente que aparece directo en el editor al presionar la tecla Espacio o /.",
      "Side-Panel de Búsqueda: Asistente que lee todos los documentos del espacio de trabajo y muestra de dónde extrajo cada dato.",
      "Tablas autocompletables por IA: Propiedades de base de datos que rellenan automáticamente resúmenes, traducciones o etiquetas.",
      "Bloques transformables: Convertidor visual para cambiar selecciones de texto a mapas mentales, listas de tareas o códigos.",
      "Vista previa de resúmenes: Encabezados automáticos interactivos situados en la parte superior de páginas complejas.",
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    provider: "DeepSeek",
    category: "Generales & Chat",
    description:
      "Motor conversacional y de razonamiento matemático ultrarrápido con una interfaz optimizada.",
    features: [
      "Visualizador del proceso de razonamiento: Módulo desplegable que muestra la lógica interna y pasos previos del modelo.",
      "Entorno minimalista ligero: Interfaz enfocada en la velocidad extrema de carga y libre de distracciones visuales.",
      "Bloques de renderizado matemático (LaTeX): Formateo impecable e interactivo para fórmulas complejas y ecuaciones.",
      "Navegador de historial de chat compacto: Organización de sesiones anteriores mediante etiquetas simples de búsqueda.",
      "Visor de código alinado: Módulo de código con sintaxis resaltada y botón de ejecución/copiado ultrarrápido.",
    ],
  },
  {
    id: "grok",
    name: "Grok",
    provider: "xAI",
    category: "Generales & Chat",
    description:
      "Conexión directa en tiempo real a las tendencias y publicaciones del planeta a través de X.",
    features: [
      "Integración en la línea de tiempo de X (Twitter): Panel lateral en la red social para analizar publicaciones, hilos y tendencias vivas.",
      "Modo Divertido vs. Modo Regular: Interruptor en la interfaz para alternar entre respuestas satíricas/filosas o neutras.",
      "Visor de eventos en tiempo real: Módulo visual que agrega publicaciones, clips y noticias recientes relacionadas con la consulta.",
      "Generación y modificación rápida de imágenes: Módulo integrado para crear visuales con menos restricciones creativas.",
      "Consola de depuración e inspección de datos: Interfaz transparente para ver los datos extraídos de las tendencias globales.",
    ],
  },
  {
    id: "jasper",
    name: "Jasper AI",
    provider: "Jasper",
    category: "Productividad",
    description:
      "Capa de creación de contenido enfocada en marcas, marketing corporativo y consistencia de tono.",
    features: [
      "Brand Voice Hub: Panel de configuración central para definir, medir y aplicar el tono de marca en todas las piezas.",
      "Lienzo de campañas integradas: Vista de flujo de trabajo que genera blogs, correos y publicaciones a partir de una única idea.",
      "Biblioteca de plantillas en cuadrícula: Galería visual categorizada para lanzar flujos de trabajo específicos en un clic.",
      "Extensión de navegador flotante: Interfaz que persigue al usuario para asistir en WordPress, Google Docs, LinkedIn, etc.",
      "Analítica de rendimiento: Dashboards que miren el engagement estimado del texto redactado antes de ser publicado.",
    ],
  },
  {
    id: "suno",
    name: "Suno AI",
    provider: "Suno",
    category: "Audio & Voz",
    description:
      "El creador de música completo de IA capaz de generar instrumentación, voz y letra de alta fidelidad.",
    features: [
      "Creador de canciones en modo Dual: Vista dividida entre modo simple (descripción lírica) y modo personalizado (letra, estilo, título).",
      "Lienzo de extensión musical: Interfaz interactiva sobre la onda de audio para elegir desde qué segundo exacto extender la canción.",
      "Editor de portada e imagen del track: Generador visual para crear la portada del álbum en conjunto con el tema musical.",
      "Reproductor persistente: Módulo de audio fijado en la parte inferior para seguir navegando la plataforma sin pausar la música.",
      "Stem Splitter (Separador de pistas): Módulo visual para aislar voces, batería o instrumentos en barras individuales.",
    ],
  },
  {
    id: "sora",
    name: "Sora",
    provider: "OpenAI",
    category: "Diseño & Video",
    description:
      "Modelo de simulación física y generación de video realista de largo alcance de OpenAI.",
    features: [
      "Lienzo storyboard de video: Interfaz para secuenciar escenas mediante prompts entrelazados visualmente.",
      "Línea de tiempo con fotogramas clave (Keyframes): Entorno para fijar imágenes de inicio y fin y dejar que la IA genere la transición.",
      "Ajuste de relación de aspecto en un clic: Interruptor directo para alternar formatos horizontales, verticales o cuadrados sin reconfigurar el prompt.",
      "Visor de semilla y consistencia: Panel técnico accesible para replicar estilos visuales y personajes en distintas tomas.",
      "Inspector de físicas y movimiento: Herramientas para revisar trayectorias de cámara y dinamismo antes de la exportación final.",
    ],
  },
  {
    id: "synthesia",
    name: "Synthesia",
    provider: "Synthesia",
    category: "Diseño & Video",
    description:
      "Generación de avatares fotorrealistas y locución sintética para videos corporativos rápidos.",
    features: [
      "Estudio de avatares fotorrealistas: Interfaz para seleccionar avatares 3D/IA y posicionarlos en una pantalla virtual.",
      "Editor de guion estilo PowerPoint: Diapositivas laterales con áreas para añadir guiones que los avatares interpretarán.",
      "Sincronización de gestos y miradas: Controles interactivos para marcar cuándo el avatar debe sonreír, hacer pausas o enfatizar.",
      "Traductor multilingüe en pantalla: Vista previa interactiva de la voz del avatar traducida a más de 120 idiomas.",
      "Plantillas de pantalla dividida: Arreglos prediseñados para combinar presentaciones, textos en pantalla y el avatar interactivo.",
    ],
  },
  {
    id: "gamma",
    name: "Gamma App",
    provider: "Gamma",
    category: "Productividad",
    description:
      "Genera presentaciones, páginas web y documentos espectaculares mediante un chat conversacional continuo.",
    features: [
      "Generador de mazos de diapositivas interactivo: Interfaz para modificar la estructura de presentaciones mediante un chat lateral.",
      "Lienzo no restrictivo (Card-based): Diseño basado en cartas flexibles que se adaptan automáticamente a cualquier volumen de texto.",
      "Insertador de widgets dinámicos: Módulo de arrastre para incrustar gráficos de datos, formularios de Typeform o prototipos de Figma.",
      "Temas y paletas de color al instante: Vista previa en tiempo real para cambiar la estética completa del documento con un clic.",
      "Analítica de vistas por tarjeta: Interfaz de usuario que mide qué diapositivas han captado más atención de los espectadores.",
    ],
  },
  {
    id: "v0",
    name: "v0.dev",
    provider: "Vercel",
    category: "Código & Desarrollo",
    description:
      "Crea interfaces UI interactivas con React y Tailwind escribiendo solo lo que imaginas.",
    features: [
      "Generador visual de componentes UI: Panel donde escribes lo que necesitas y muestra el código y la interfaz funcional renderizada al lado.",
      "Inspección de elementos por clic: Puedes hacer clic en cualquier parte del componente generado para pedir modificaciones específicas.",
      "Lienzo interactivo (Preview / Code mode): Alternancia inmediata entre interactuar con la app generada y copiar su código en React/Tailwind.",
      "Historial de iteraciones en versiones: Línea temporal visual para regresar a estados de diseño previos sin perder progreso.",
      "Integración directa con repositorios: Botones integrados para exportar soluciones a bibliotecas o entornos de desarrollo en la nube.",
    ],
  },
  {
    id: "character",
    name: "Character.ai",
    provider: "Character.ai",
    category: "Generales & Chat",
    description:
      "Interacciones, diálogos y mundos dinámicos guiados por miles de personalidades artificiales de la comunidad.",
    features: [
      "Salas de chat múltiples (Rooms): Interfaz para poner a conversar a varios personajes creados por IA en una misma pantalla.",
      "Creación visual de bots: Formulario con asistentes para definir imagen, voz, saludo inicial y personalidad del personaje.",
      "Modo de voz integrado: Selector de tonos y voces para escuchar las respuestas del personaje en tiempo real.",
      "Sistema de puntuación por estrellas: Interfaz rápida de 1 a 4 estrellas en cada respuesta para guiar el aprendizaje del bot.",
      "Pestaña de comunidad e historias: Módulo interactivo de descubrimiento para explorar chats populares o escenarios narrativos.",
    ],
  },
  {
    id: "gemini",
    name: "Gemini",
    provider: "Google",
    category: "Código & Desarrollo",
    description:
      "Modelo multimodal de Google para razonamiento, código y generación soberana — vía API directa con GEMINI_API_KEY.",
    features: [
      "Generación multimodal nativa: Texto, código, visión y razonamiento con ventana de contexto larga y streaming.",
      "Function calling soberano: Invocación tipada de tools con validación Zod y auditoría CROWN antes de ejecutar.",
      "Grounding con Google Search: Capa opcional de verificación con fuentes citadas y control de alucinaciones.",
      "Ventana 1M+ tokens: Procesamiento de documentos extensos, memoria territorial y repositorios completos.",
      "Despliegue Vercel directo: API `generativelanguage.googleapis.com` con `GEMINI_API_KEY` y circuit breaker 8.5s.",
    ],
  },
  {
    id: "descript",
    name: "Descript",
    provider: "Descript Inc.",
    category: "Audio & Voz",
    description:
      "Software para redefinir el flujo de edición audiovisual convirtiendo video y voz en texto escrito.",
    features: [
      "Edición de audio/video mediante texto: Interfaz donde borrar una palabra en la transcripción escrita elimina automáticamente el audio/video.",
      "Studio Sound: Módulo interactivo de un solo botón que elimina el ruido de fondo y procesa la voz con calidad de estudio.",
      "Eliminador de palabras de relleno: Resaltado automático de 'eeh', 'este', 'umm' para borrarlos del video en lote.",
      "Eye Contact Correction: Interruptor visual que ajusta digitalmente la mirada del locutor para que parezca que mira fijo a la cámara.",
      "Línea de tiempo multipista clásica + texto: Combinación fluida entre un editor de documentos y una línea de tiempo de producción.",
    ],
  },
  {
    id: "heygen",
    name: "HeyGen",
    provider: "HeyGen",
    category: "Diseño & Video",
    description:
      "Creación de avatares corporativos impecables y traducción con perfecta sincronía de labios.",
    features: [
      "Generador de Avatares Personalizados: Proceso guiado para crear un duplicado digital con pocos minutos de video.",
      "Editor de video interactivo: Canvas con capas de texto, imágenes, música y avatares alineados por escenas.",
      "Traductor de video con clonación de voz: Panel para traducir videos manteniendo la voz original y ajustando el movimiento de los labios.",
      "Plantillas para equipos de ventas/Mkt: Diseños listos para personalizar nombres y datos dinámicos en emails en masa.",
      "Modo de foto hablada (Talking Photo): Carga de una imagen fija para convertirla en un avatar animado que habla mediante guiones.",
    ],
  },
  {
    id: "fathom",
    name: "Fathom AI",
    provider: "Fathom",
    category: "Productividad",
    description:
      "Tu grabador inteligente de reuniones que automatiza resúmenes, actas y compromisos con absoluta discreción.",
    features: [
      "Grabador de reuniones no intrusivo: Interfaz limpia que se integra sobre llamadas de Zoom, Teams o Google Meet.",
      "Generador de actas por pestañas: Organización visual del resumen por temas, acciones a realizar y momentos clave.",
      "Clips de video interactivos: Posibilidad de hacer clic en una línea de texto del resumen para saltar al segundo exacto del video.",
      "Sincronización con CRM: Módulo de un clic para enviar las notas estructzradas directamente a HubSpot, Salesforce o Notion.",
      "Buscador global en transcripciones: Barra de búsqueda visual para encontrar frases concretas en todas las reuniones pasadas.",
    ],
  },
  {
    id: "ideogram",
    name: "Ideogram",
    provider: "Ideogram",
    category: "Diseño & Video",
    description:
      "El referente absoluto de diseño tipográfico y legibilidad de texto integrado sobre composiciones de imagen.",
    features: [
      "Renderizado superior de texto en imágenes: Interfaz destacada por crear tipografías impecables dentro de las imágenes generadas.",
      "Palette & Style Selectors: Botones directos para aplicar paletas de colores corporativas o estilos (3D, Ilustración, Foto, Tipografía).",
      "Magic Prompt Auto-enhancer: Modificador visual que amplía automáticamente los prompts sencillos para obtener mejores detalles.",
      "Inspector de aspectos y resoluciones: Controles directos para elegir la dimensión exacta de la imagen según la red social destino.",
      "Remix / Canvas: Espacio para combinar elementos de múltiples imágenes y modificarlas por partes mediante capas.",
    ],
  },
];

export function AiInterfacesHub() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [selectedPlatform, setSelectedPlatform] = useState<string>("chatgpt");

  const filteredPlatforms = AI_PLATFORMS.filter((platform) => {
    const matchesSearch =
      platform.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      platform.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      platform.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      platform.features.some((f) => f.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesCategory = activeCategory === "all" || platform.category === activeCategory;

    return matchesSearch && matchesCategory;
  });

  const categories = [
    "all",
    "Generales & Chat",
    "Código & Desarrollo",
    "Diseño & Video",
    "Audio & Voz",
    "Productividad",
  ];

  const currentPlatform = AI_PLATFORMS.find((p) => p.id === selectedPlatform) || AI_PLATFORMS[0];

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "Generales & Chat":
        return <Sparkles className="size-4" />;
      case "Código & Desarrollo":
        return <Code2 className="size-4" />;
      case "Diseño & Video":
        return <Palette className="size-4" />;
      case "Audio & Voz":
        return <Volume2 className="size-4" />;
      case "Productividad":
        return <LayoutTemplate className="size-4" />;
      default:
        return <Monitor className="size-4" />;
    }
  };

  return (
    <div className="space-y-6 text-foreground p-6 bg-background rounded-3xl border border-border/20 shadow-xl max-w-7xl mx-auto">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-border/15">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-crown/15 border border-crown/30 flex items-center justify-center shadow-[0_0_15px_-4px_rgba(180,112,249,0.3)]">
            <Sparkles className="size-6 text-crown animate-pulse" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-display tracking-wide text-platinum flex items-center gap-2">
              Lienzo de Innovación de Interfaces de IA
            </h2>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Análisis canónico de las 25 inteligencias artificiales y sus mejores características
              de interfaz (UI).
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono bg-crown/10 border border-crown/20 text-crown px-3 py-1.5 rounded-xl">
          <Compass className="size-3.5" /> 25 Plataformas Mapeadas
        </div>
      </div>

      {/* Categories Toolbar & Search bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-8 flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setActiveCategory(cat);
                // Auto reset selected platform to first matching search to avoid blank active platform state
                const firstMatch = AI_PLATFORMS.find((p) => cat === "all" || p.category === cat);
                if (firstMatch) setSelectedPlatform(firstMatch.id);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono transition-all border ${
                activeCategory === cat
                  ? "bg-crown/15 border-crown/40 text-crown font-semibold shadow-[0_0_12px_-3px_rgba(180,112,249,0.25)]"
                  : "bg-secondary/10 border-transparent text-muted-foreground hover:bg-secondary/20 hover:text-platinum"
              }`}
            >
              {getCategoryIcon(cat)}
              <span className="capitalize">{cat === "all" ? "Todos" : cat}</span>
            </button>
          ))}
        </div>
        <div className="md:col-span-4 relative">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar plataformas o características..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Auto select first match if query changes
              const matches = AI_PLATFORMS.filter((p) => {
                const query = e.target.value.toLowerCase();
                return (
                  p.name.toLowerCase().includes(query) ||
                  p.features.some((f) => f.toLowerCase().includes(query))
                );
              });
              if (matches.length > 0) {
                setSelectedPlatform(matches[0].id);
              }
            }}
            className="w-full bg-secondary/10 border border-border/15 hover:border-border/30 focus:border-crown text-xs font-mono text-platinum rounded-xl pl-9 pr-4 py-2 outline-none transition-all placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Dynamic Grid split: Left menu list of matched items / Right Detail viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left matched menu list */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[580px] overflow-y-auto pr-1">
          <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider pl-1 pb-1">
            Plataformas Encontradas ({filteredPlatforms.length})
          </div>
          {filteredPlatforms.length > 0 ? (
            filteredPlatforms.map((platform) => {
              const isSelected = platform.id === selectedPlatform;
              return (
                <div
                  key={platform.id}
                  onClick={() => setSelectedPlatform(platform.id)}
                  className={`group relative flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-crown/10 border-crown/40 shadow-[0_0_15px_-4px_rgba(180,112,249,0.2)]"
                      : "bg-secondary/5 border-border/5 hover:border-border/15 hover:bg-secondary/10"
                  }`}
                >
                  <div className="space-y-1 max-w-[85%]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-platinum font-mono">
                        {platform.name}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-md bg-secondary/20 text-muted-foreground border border-border/10">
                        {platform.provider}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground line-clamp-1 leading-relaxed">
                      {platform.description}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <div className="text-crown group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all">
                      <ArrowUpRight className="size-4" />
                    </div>
                    <span className="text-[9px] font-mono text-muted-foreground">
                      {platform.category}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center bg-secondary/5 rounded-2xl border border-dashed border-border/15 text-muted-foreground font-mono text-xs">
              <Info className="size-6 text-muted-foreground mx-auto mb-2 opacity-55" />
              Ninguna plataforma coincide con los filtros especificados.
            </div>
          )}
        </div>

        {/* Right canonical Detail view pane with beautiful cards and checklists */}
        <div className="lg:col-span-7">
          {currentPlatform ? (
            <div className="p-5 md:p-6 rounded-2xl bg-secondary/10 border border-border/15 space-y-6">
              {/* Top info and provider bar */}
              <div className="flex items-start justify-between pb-4 border-b border-border/10">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold font-mono text-platinum tracking-wide">
                      {currentPlatform.name}
                    </h3>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-crown/20 text-crown font-semibold border border-crown/25">
                      {currentPlatform.provider}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {currentPlatform.description}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-secondary/20 border border-border/10 text-[10px] font-mono text-muted-foreground">
                  {getCategoryIcon(currentPlatform.category)}
                  <span>{currentPlatform.category}</span>
                </div>
              </div>

              {/* Checklist header */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold font-mono text-platinum uppercase tracking-wider flex items-center gap-2">
                  <LayoutTemplate className="size-4 text-crown" />
                  Las 5 mejores características de su interfaz de usuario (UI):
                </h4>

                {/* 5 checkpoints beautifully mapped */}
                <div className="space-y-2.5">
                  {currentPlatform.features.map((feature, idx) => {
                    const [title, desc] = feature.split(": ");
                    return (
                      <div
                        key={idx}
                        className="flex items-start gap-3 p-3 rounded-xl bg-secondary/5 border border-border/10 hover:border-crown/20 transition-all group"
                      >
                        <div className="mt-0.5 size-5 shrink-0 rounded-md bg-crown/15 border border-crown/20 flex items-center justify-center font-mono text-[10px] text-crown font-bold group-hover:bg-crown group-hover:text-black transition-all">
                          {idx + 1}
                        </div>
                        <div className="space-y-1">
                          <span className="text-[11.5px] font-bold text-platinum font-mono block">
                            {title}
                          </span>
                          {desc && (
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                              {desc}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Extra Interactive Playground visual sandbox */}
              <div className="p-4 rounded-xl bg-crown/5 border border-crown/15 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-mono text-crown font-semibold flex items-center gap-1.5">
                    <MousePointerClick className="size-3.5" /> LIENZO INTERACTIVO DE SIMULACIÓN UI
                  </span>
                  <span className="text-[9px] font-mono text-muted-foreground">
                    Isabella Cognición Híbrida
                  </span>
                </div>
                <p className="text-[10.5px] text-muted-foreground font-mono leading-relaxed">
                  Puedes interactuar con los artefactos y flujos simulados de{" "}
                  <strong>{currentPlatform.name}</strong>. CROWN Gateway evalúa que los patrones de
                  UI se adecuen a la soberanía cognitiva comunitaria.
                </p>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 rounded-lg bg-crown/15 hover:bg-crown text-crown hover:text-black text-[10px] font-bold font-mono uppercase tracking-wider transition-all">
                    Simular Lienzo Canvas
                  </button>
                  <button className="px-3 py-1.5 rounded-lg bg-secondary/20 hover:bg-secondary/30 text-platinum text-[10px] font-bold font-mono uppercase tracking-wider transition-all">
                    Explorar Origen Web
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-secondary/5 rounded-2xl border border-dashed border-border/15 text-muted-foreground font-mono text-xs">
              <Sparkles className="size-8 text-crown mx-auto mb-3 opacity-60 animate-pulse" />
              Selecciona una plataforma del menú lateral para inspeccionar sus características UI
              canonizadas.
            </div>
          )}
        </div>
      </div>

      {/* Summary Footer bar */}
      <div className="p-4 rounded-2xl bg-secondary/5 border border-border/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span>Gobernanza de Patrones de Interfaces Sostenibles</span>
        </div>
        <div>
          <span>Licencia: CC BY 4.0 | Edwin Oswaldo Castillo Trejo</span>
        </div>
      </div>
    </div>
  );
}
