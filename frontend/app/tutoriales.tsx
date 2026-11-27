/**
 * CICLAPP — Tutoriales y Tips
 * app/tutoriales.tsx
 *
 * Cada tutorial se muestra como un CARRUSEL de pasos: una "diapositiva" por paso
 * con ilustración, título y descripción. Cada tutorial además tiene un botón
 * para ver videos en YouTube (en español).
 *
 * ► Para usar una foto/imagen real en un paso, agrega la propiedad `imagen`:
 *     paso("hand-left", "Girar a la izquierda", "Extiende el brazo...",
 *          require("../assets/images/tutoriales/giro-izquierda.png"))
 *   Si no hay `imagen`, se dibuja una ilustración con el ícono del paso.
 *
 * ► Para usar un video específico en vez de la búsqueda, reemplaza
 *     video: yt("...")
 *   por
 *     video: "https://youtu.be/XXXXXXXXXXX"
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  Image,
  ImageSourcePropType,
  LayoutChangeEvent,
  Linking,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#27AE60",
  primaryDark: "#1E8449",
  primaryLight: "#EAFAF1",
  background: "#F8FAF9",
  surface: "#FFFFFF",
  textPrimary: "#1A1A2E",
  textSecondary: "#6B7280",
  textMuted: "#9CA3AF",
  border: "#E5E7EB",
} as const;

const SPACING = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
const RADIUS = { sm: 8, md: 14, lg: 20, xl: 28, full: 999 } as const;

// ─────────────────────────────────────────────────────────────
// DATOS: Categorías y tutoriales
// ─────────────────────────────────────────────────────────────

type IconName = keyof typeof Ionicons.glyphMap;

type Paso = {
  icono: IconName;
  titulo: string;
  texto: string;
  imagen?: ImageSourcePropType;
};

type Tutorial = {
  id: string;
  titulo: string;
  descripcion: string;
  duracion: string;
  nivel: "Básico" | "Intermedio" | "Avanzado";
  pasos: Paso[];
  /** Link a YouTube (búsqueda en español o link directo a un video). */
  video?: string;
};

type Categoria = {
  id: string;
  label: string;
  icon: IconName;
  color: string;
  bg: string;
  tutoriales: Tutorial[];
};

const paso = (icono: IconName, titulo: string, texto: string, imagen?: ImageSourcePropType): Paso => ({
  icono,
  titulo,
  texto,
  imagen,
});

/**
 * Búsqueda de YouTube en español.
 * Reemplázala por un link directo (https://youtu.be/XXXX) cuando elijas un video.
 */
const yt = (consulta: string) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(consulta)}&hl=es`;

const CATEGORIAS: Categoria[] = [
  {
    id: "seguridad",
    label: "Seguridad vial",
    icon: "shield-checkmark-outline",
    color: "#E74C3C",
    bg: "#FDEDEC",
    tutoriales: [
      {
        id: "s1",
        titulo: "Señales de mano para ciclistas",
        descripcion: "Aprende a comunicarte con conductores y otros ciclistas.",
        duracion: "3 min",
        nivel: "Básico",
        pasos: [
          paso("arrow-back-circle", "Girar a la izquierda", "Extiende el brazo izquierdo en horizontal, con la mano abierta."),
          paso("arrow-forward-circle", "Girar a la derecha", "Extiende el brazo derecho en horizontal. Hazlo con anticipación."),
          paso("stop-circle", "Frenar o detenerte", "Baja el brazo izquierdo con la palma hacia atrás para avisar que vas a parar."),
          paso("warning", "Peligro atrás", "Levanta el brazo izquierdo hacia arriba para avisar de un obstáculo o hueco."),
          paso("checkmark-circle", "Practica antes de salir", "Ensaya las señales en un lugar tranquilo hasta que te salgan naturales."),
        ],
        video: yt("señales de mano para ciclistas tutorial"),
      },
      {
        id: "s2",
        titulo: "Cómo usar el casco correctamente",
        descripcion: "Un casco mal puesto no protege. Aprende a ajustarlo.",
        duracion: "2 min",
        nivel: "Básico",
        pasos: [
          paso("happy", "Posición en la frente", "El casco debe cubrir la frente: dos dedos sobre las cejas, ni muy atrás ni muy inclinado."),
          paso("git-merge", "Cintas en forma de V", "Ajusta las cintas laterales para que formen una V justo bajo cada oreja."),
          paso("hand-left", "Correa del mentón", "Debe quedar firme: solo debe caber un dedo entre la correa y tu barbilla."),
          paso("sync", "Prueba de sacudida", "Mueve la cabeza de lado a lado: si el casco se mueve solo, ajústalo más."),
          paso("refresh-circle", "Cámbialo si se golpea", "Reemplaza el casco tras un golpe fuerte, aunque no se vea dañado."),
        ],
        video: yt("cómo ajustar el casco de bicicleta correctamente"),
      },
      {
        id: "s3",
        titulo: "Rodar de noche con visibilidad",
        descripcion: "Luces, reflectivos y posición para que todos te vean.",
        duracion: "3 min",
        nivel: "Básico",
        pasos: [
          paso("flashlight", "Luz delantera blanca", "Fija al manubrio, apuntando al frente y un poco hacia abajo para no encandilar."),
          paso("radio-button-on", "Luz trasera roja", "Instálala bajo el asiento o en la mochila. Mejor en modo intermitente."),
          paso("shirt", "Ropa reflectiva", "Chaleco o bandas reflectivas en tobillos y muñecas: el movimiento llama la atención."),
          paso("speedometer", "Reduce la velocidad", "De noche reaccionas más tarde. Baja el ritmo y aumenta la distancia de frenado."),
          paso("battery-charging", "Carga y revisa", "Carga las luces antes de salir y lleva pilas o un cable de respaldo."),
        ],
        video: yt("luces y reflectivos para rodar de noche en bicicleta"),
      },
      {
        id: "s4",
        titulo: "Convivir con buses y camiones",
        descripcion: "Entiende los puntos ciegos y circula con seguridad.",
        duracion: "4 min",
        nivel: "Intermedio",
        pasos: [
          paso("eye-off", "Conoce el punto ciego", "Si no ves el espejo del conductor, él tampoco te ve a ti."),
          paso("bus", "No te pongas a su lado", "Evita quedarte junto a buses o camiones, sobre todo en esquinas y semáforos."),
          paso("resize", "Mantén distancia", "Deja al menos 2 metros detrás de un vehículo grande."),
          paso("eye", "Haz contacto visual", "Antes de cruzar o adelantar, mira al conductor y confirma que te vio."),
          paso("arrow-forward", "Sé predecible", "Rueda en línea recta y señaliza con tiempo cada maniobra."),
        ],
        video: yt("ciclistas puntos ciegos buses camiones seguridad vial"),
      },
    ],
  },
  {
    id: "mantenimiento",
    label: "Mantenimiento",
    icon: "construct-outline",
    color: "#E67E22",
    bg: "#FEF9E7",
    tutoriales: [
      {
        id: "m1",
        titulo: "Revisión pre-salida en 5 minutos",
        descripcion: "El checklist ABC que todo ciclista debe hacer antes de rodar.",
        duracion: "5 min",
        nivel: "Básico",
        pasos: [
          paso("cloud", "A — Aire", "Presiona los neumáticos: deben estar firmes (70-120 PSI en ruta, 30-50 PSI en MTB)."),
          paso("hand-left", "B — Brakes (frenos)", "Aprieta cada palanca: la bici debe detenerse de inmediato y sin llegar al manubrio."),
          paso("link", "C — Chain (cadena)", "Debe estar limpia, lubricada y sin óxido. Gira los pedales y escucha."),
          paso("construct", "Asiento y manubrio", "Verifica que estén bien apretados y alineados con la rueda delantera."),
          paso("flashlight", "Luces", "Si vas a salir de noche, comprueba que la luz delantera y trasera funcionen."),
        ],
        video: yt("revisión antes de salir en bicicleta método ABC"),
      },
      {
        id: "m2",
        titulo: "Cómo reparar un pinchazo",
        descripcion: "Aprende a cambiar la llanta en la calle sin ayuda.",
        duracion: "10 min",
        nivel: "Intermedio",
        pasos: [
          paso("briefcase", "Lleva tu kit", "Palancas de llanta, parche o cámara de repuesto e inflador portátil."),
          paso("disc", "Retira la rueda", "Afloja el eje (cierre rápido o llave) y saca la rueda del cuadro."),
          paso("cut", "Saca el neumático", "Usa las palancas para sacar un lado del neumático del rin."),
          paso("search", "Encuentra el pinchazo", "Infla un poco la cámara y escucha o siente dónde sale el aire. Revisa también el neumático por dentro."),
          paso("build", "Parcha o cambia", "Pega el parche o monta la cámara nueva, acomoda el neumático e infla."),
        ],
        video: yt("cómo reparar un pinchazo de bicicleta paso a paso"),
      },
      {
        id: "m3",
        titulo: "Limpieza y lubricación de la cadena",
        descripcion: "Alarga la vida de tu transmisión con 10 minutos al mes.",
        duracion: "10 min",
        nivel: "Básico",
        pasos: [
          paso("water", "Retira la suciedad", "Con un trapo y desengrasante, limpia la cadena girando los pedales hacia atrás."),
          paso("sparkles", "Limpia piñones y plato", "Pasa un cepillo viejo entre los dientes para sacar la grasa acumulada."),
          paso("time", "Deja secar", "Espera unos minutos: lubricar sobre humedad atrae más suciedad."),
          paso("water-outline", "Aplica lubricante", "Una gota por eslabón mientras giras los pedales hacia atrás."),
          paso("cut", "Quita el exceso", "Limpia el sobrante con un trapo seco. Cadena seca por fuera, lubricada por dentro."),
        ],
        video: yt("cómo limpiar y lubricar la cadena de la bicicleta"),
      },
      {
        id: "m4",
        titulo: "Ajuste básico de frenos",
        descripcion: "Que tus frenos respondan bien cuando más los necesitas.",
        duracion: "8 min",
        nivel: "Intermedio",
        pasos: [
          paso("hand-left", "Prueba la palanca", "Si llega muy cerca del manubrio, los frenos necesitan ajuste."),
          paso("settings", "Tensor del cable", "Gira el regulador del cable hacia afuera para tensar el freno."),
          paso("resize", "Centra las zapatas", "Las zapatas deben tocar el rin parejo, sin rozar la llanta."),
          paso("warning", "Revisa el desgaste", "Si las zapatas o pastillas están lisas o muy gastadas, cámbialas."),
          paso("checkmark-circle", "Haz una prueba", "Rueda despacio y frena fuerte en un sitio seguro antes de salir a la vía."),
        ],
        video: yt("cómo ajustar frenos de bicicleta"),
      },
    ],
  },
  {
    id: "rutas",
    label: "Rutas en Bogotá",
    icon: "map-outline",
    color: "#27AE60",
    bg: "#EAFAF1",
    tutoriales: [
      {
        id: "r1",
        titulo: "Ciclovía dominical: todo lo que debes saber",
        descripcion: "Rutas, horarios y reglas de la ciclovía más grande de Latinoamérica.",
        duracion: "4 min",
        nivel: "Básico",
        pasos: [
          paso("time", "Horario", "Domingos y festivos de 7:00 AM a 2:00 PM."),
          paso("trail-sign", "120 km de vías", "Carrera 7, Av. El Dorado, Calle 26 y muchas más se abren para ciclistas."),
          paso("arrow-forward", "Circula por la derecha", "Mantente en el carril derecho y adelanta siempre por la izquierda."),
          paso("speedometer", "Velocidad moderada", "Máximo recomendado: 25 km/h en zonas concurridas."),
          paso("bookmark", "Guarda la ruta", "Guarda la ciclovía en el mapa antes de salir para no perderte."),
        ],
        video: yt("ciclovía dominical Bogotá IDRD consejos"),
      },
      {
        id: "r2",
        titulo: "Ciclorrutas permanentes de Bogotá",
        descripcion: "Las principales ciclorrutas que puedes usar todos los días.",
        duracion: "3 min",
        nivel: "Básico",
        pasos: [
          paso("navigate", "Av. Chile (Calle 72)", "Conecta Chapinero con el occidente de la ciudad."),
          paso("location", "Carrera 11", "Va desde La Candelaria hasta Usaquén."),
          paso("water", "Canal del Río Fucha", "Ideal para salidas largas hacia el sur."),
          paso("swap-vertical", "Av. NQS", "Une el sur y el norte a lo largo de toda la ciudad."),
          paso("download", "Descarga el mapa", "Baja el mapa de ciclorrutas del IDRD en tu celular antes de salir."),
        ],
        video: yt("ciclorrutas de Bogotá principales recorridos"),
      },
      {
        id: "r3",
        titulo: "Cómo planear tu ruta con CiclApp",
        descripcion: "Registra, guarda y repite tus recorridos favoritos.",
        duracion: "3 min",
        nivel: "Básico",
        pasos: [
          paso("map", "Abre el mapa", "Entra a la sección Mapa para ver ciclorrutas y puntos cercanos."),
          paso("flag", "Elige tu destino", "Selecciona el punto de llegada y revisa la distancia estimada."),
          paso("play-circle", "Inicia tu recorrido", "Pulsa iniciar y la app guardará tu trayecto por GPS."),
          paso("stats-chart", "Revisa tus estadísticas", "Al terminar verás distancia, tiempo y velocidad promedio."),
          paso("trophy", "Gana logros", "Cada ruta cuenta para desbloquear nuevos logros."),
        ],
        video: yt("cómo planear una ruta en bicicleta con GPS app"),
      },
    ],
  },
  {
    id: "salud",
    label: "Salud y rendimiento",
    icon: "fitness-outline",
    color: "#8E44AD",
    bg: "#F5EEF8",
    tutoriales: [
      {
        id: "h1",
        titulo: "Calentamiento antes de rodar",
        descripcion: "5 minutos que previenen lesiones y mejoran tu rendimiento.",
        duracion: "5 min",
        nivel: "Básico",
        pasos: [
          paso("sync", "Rota los tobillos", "10 giros en cada sentido con cada pie."),
          paso("body", "Sentadillas suaves", "Haz 10 sentadillas superficiales para activar los cuádriceps."),
          paso("walk", "Estira pantorrillas", "Punta del pie contra una pared, 20 segundos por lado."),
          paso("happy", "Cuello y hombros", "Gira el cuello suavemente de lado a lado para soltar tensión."),
          paso("bicycle", "Arranca suave", "Pedalea a ritmo muy tranquilo durante los primeros 5 minutos."),
        ],
        video: yt("calentamiento antes de salir en bicicleta ciclistas"),
      },
      {
        id: "h2",
        titulo: "Hidratación y alimentación sobre la bici",
        descripcion: "Qué tomar y comer para no quedarte sin energía.",
        duracion: "4 min",
        nivel: "Básico",
        pasos: [
          paso("water", "Toma antes de salir", "Bebe un vaso de agua 20–30 minutos antes de rodar."),
          paso("time", "Cada 20 minutos", "Toma pequeños sorbos aunque no sientas sed."),
          paso("nutrition", "Snack para salidas largas", "En recorridos de más de una hora lleva fruta, barras o frutos secos."),
          paso("thermometer", "Cuidado con el calor", "Si sientes mareo o dolor de cabeza, detente en la sombra e hidrátate."),
          paso("restaurant", "Recupérate después", "Come algo con proteína y carbohidratos en la hora siguiente."),
        ],
        video: yt("hidratación y alimentación en ciclismo qué comer"),
      },
      {
        id: "h3",
        titulo: "Postura correcta sobre la bici",
        descripcion: "Evita dolores de espalda, rodillas y manos.",
        duracion: "4 min",
        nivel: "Intermedio",
        pasos: [
          paso("arrow-up", "Altura del asiento", "Al pedalear, la rodilla debe quedar ligeramente flexionada abajo."),
          paso("body", "Espalda relajada", "Inclínate un poco hacia adelante sin encorvar la espalda."),
          paso("hand-right", "Brazos sueltos", "Codos ligeramente flexionados para absorber los golpes de la vía."),
          paso("eye", "Mira hacia adelante", "Cabeza arriba, mirando lejos y no justo a la rueda."),
          paso("sync", "Cambia de posición", "Mueve las manos y cambia de postura cada tanto para evitar fatiga."),
        ],
        video: yt("postura correcta en la bicicleta ajuste de sillín"),
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────
// COMPONENTE: CarruselPasos (una diapositiva por paso)
// ─────────────────────────────────────────────────────────────

function CarruselPasos({ pasos, color }: { pasos: Paso[]; color: string }) {
  const [ancho, setAncho] = useState(0);
  const [indice, setIndice] = useState(0);
  const listRef = useRef<FlatList<Paso>>(null);

  const onLayout = (e: LayoutChangeEvent) => setAncho(e.nativeEvent.layout.width);

  const irA = useCallback(
    (i: number) => {
      const destino = Math.max(0, Math.min(pasos.length - 1, i));
      listRef.current?.scrollToOffset({ offset: destino * ancho, animated: true });
      setIndice(destino);
    },
    [ancho, pasos.length]
  );

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!ancho) return;
    setIndice(Math.round(e.nativeEvent.contentOffset.x / ancho));
  };

  const esUltimo = indice === pasos.length - 1;

  return (
    <View onLayout={onLayout}>
      {ancho > 0 && (
        <FlatList
          ref={listRef}
          data={pasos}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(_, i) => String(i)}
          onMomentumScrollEnd={onScrollEnd}
          getItemLayout={(_, i) => ({ length: ancho, offset: ancho * i, index: i })}
          renderItem={({ item, index }) => (
            <View style={{ width: ancho }}>
              {/* Ilustración / imagen */}
              <View style={[styles.slideArte, { backgroundColor: color + "18" }]}>
                {item.imagen ? (
                  <Image source={item.imagen} style={styles.slideImagen} resizeMode="cover" />
                ) : (
                  <>
                    <View style={[styles.deco, { width: 120, height: 120, top: -30, left: -30, backgroundColor: color + "20" }]} />
                    <View style={[styles.deco, { width: 90, height: 90, bottom: -25, right: -15, backgroundColor: color + "25" }]} />
                    <View style={[styles.deco, { width: 28, height: 28, top: 28, right: 40, backgroundColor: color + "30" }]} />
                    <View style={[styles.slideIconoWrap, { backgroundColor: color }]}>
                      <Ionicons name={item.icono} size={54} color="#FFF" />
                    </View>
                  </>
                )}
                <View style={[styles.slideContador, { backgroundColor: color }]}>
                  <Text style={styles.slideContadorText}>
                    {index + 1}/{pasos.length}
                  </Text>
                </View>
              </View>

              {/* Texto */}
              <View style={styles.slideTexto}>
                <Text style={[styles.slideTitulo, { color }]}>{item.titulo}</Text>
                <Text style={styles.slideDesc}>{item.texto}</Text>
              </View>
            </View>
          )}
        />
      )}

      {/* Controles: anterior · puntos · siguiente */}
      <View style={styles.carControles}>
        <TouchableOpacity
          style={[styles.carBtn, indice === 0 && styles.carBtnOff]}
          onPress={() => irA(indice - 1)}
          disabled={indice === 0}
          accessibilityLabel="Paso anterior"
        >
          <Ionicons name="chevron-back" size={18} color={indice === 0 ? COLORS.textMuted : color} />
        </TouchableOpacity>

        <View style={styles.dots}>
          {pasos.map((_, i) => (
            <TouchableOpacity key={i} onPress={() => irA(i)} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
              <View
                style={[
                  styles.dot,
                  i === indice && { width: 20, backgroundColor: color },
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.carBtn, { backgroundColor: esUltimo ? COLORS.border : color }]}
          onPress={() => irA(indice + 1)}
          disabled={esUltimo}
          accessibilityLabel="Paso siguiente"
        >
          <Ionicons name="chevron-forward" size={18} color={esUltimo ? COLORS.textMuted : "#FFF"} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: TutorialCard (expandible)
// ─────────────────────────────────────────────────────────────

function TutorialCard({ tutorial, color }: { tutorial: Tutorial; color: string }) {
  const [expanded, setExpanded] = useState(false);

  const nivelColor = { Básico: "#27AE60", Intermedio: "#E67E22", Avanzado: "#E74C3C" }[tutorial.nivel];

  const abrirVideo = () => {
    if (!tutorial.video) return;
    Linking.openURL(tutorial.video).catch(() => {
      // Si no se puede abrir el enlace, no hacemos nada para no romper la pantalla.
    });
  };

  return (
    <View style={styles.tutCard}>
      <Pressable style={styles.tutCardHeader} onPress={() => setExpanded((v) => !v)}>
        <View style={styles.tutCardMeta}>
          <View style={[styles.nivelBadge, { backgroundColor: nivelColor + "20" }]}>
            <Text style={[styles.nivelText, { color: nivelColor }]}>{tutorial.nivel}</Text>
          </View>
          <View style={styles.duracionBadge}>
            <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
            <Text style={styles.duracionText}>{tutorial.duracion}</Text>
          </View>
          <View style={styles.duracionBadge}>
            <Ionicons name="images-outline" size={11} color={COLORS.textMuted} />
            <Text style={styles.duracionText}>{tutorial.pasos.length} pasos</Text>
          </View>
        </View>
        <View style={styles.tutCardTitleRow}>
          <Text style={styles.tutCardTitle}>{tutorial.titulo}</Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={COLORS.textMuted} />
        </View>
        <Text style={styles.tutCardDesc}>{tutorial.descripcion}</Text>
      </Pressable>

      {expanded && (
        <View style={styles.tutCarrusel}>
          <View style={[styles.tutPasosDivider, { backgroundColor: color + "40" }]} />
          <CarruselPasos pasos={tutorial.pasos} color={color} />

          {/* Botón de video en YouTube */}
          {tutorial.video && (
            <TouchableOpacity
              style={[styles.videoBtn, { backgroundColor: color + "15", borderColor: color + "40" }]}
              onPress={abrirVideo}
              accessibilityLabel="Ver videos en YouTube"
            >
              <Ionicons name="logo-youtube" size={20} color="#E74C3C" />
              <Text style={[styles.videoBtnText, { color }]}>Ver videos en YouTube (español)</Text>
              <Ionicons name="open-outline" size={16} color={color} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────

export default function TutorialesScreen() {
  const [categoriaActiva, setCategoriaActiva] = useState(CATEGORIAS[0].id);
  const categoria = CATEGORIAS.find((c) => c.id === categoriaActiva)!;

  const tipDelDia = [
    "🌧️ En lluvia, frena con 3x más anticipación. Los frenos de disco mojados tardan más.",
    "💧 Hidrátate cada 20 minutos de pedaleo, aunque no sientas sed.",
    "🌙 Si sales de noche, luz delantera blanca + luz trasera roja = obligatorio.",
    "👀 Revisa el punto ciego de los camiones. Si no puedes ver su espejo, ellos no te ven.",
    "🪱 Lubrica la cadena cada 200 km o después de llover.",
  ][new Date().getDay() % 5];

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── HEADER ── */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={22} color={COLORS.textPrimary} />
          </TouchableOpacity>
          <View>
            <Text style={styles.headerTitle}>Tutoriales & Tips</Text>
            <Text style={styles.headerSub}>Aprende a rodar mejor y más seguro</Text>
          </View>
        </View>

        {/* ── TIP DEL DÍA ── */}
        <View style={styles.tipDia}>
          <View style={styles.tipDiaHeader}>
            <Ionicons name="bulb-outline" size={16} color={COLORS.primary} />
            <Text style={styles.tipDiaLabel}>Tip del día</Text>
          </View>
          <Text style={styles.tipDiaText}>{tipDelDia}</Text>
        </View>

        {/* ── SELECTOR DE CATEGORÍAS ── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categScrollContent}>
          {CATEGORIAS.map((cat) => {
            const activa = cat.id === categoriaActiva;
            return (
              <TouchableOpacity
                key={cat.id}
                style={[styles.catChip, activa && { backgroundColor: cat.color, borderColor: cat.color }]}
                onPress={() => setCategoriaActiva(cat.id)}
              >
                <Ionicons name={cat.icon} size={15} color={activa ? "#FFF" : COLORS.textSecondary} />
                <Text style={[styles.catChipText, activa && { color: "#FFF" }]}>{cat.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── TUTORIALES DE LA CATEGORÍA ── */}
        <View style={styles.tutorialesSection}>
          <View style={[styles.categHeader, { backgroundColor: categoria.bg }]}>
            <View style={[styles.categIconWrap, { backgroundColor: categoria.color }]}>
              <Ionicons name={categoria.icon} size={20} color="#FFF" />
            </View>
            <View>
              <Text style={[styles.categTitle, { color: categoria.color }]}>{categoria.label}</Text>
              <Text style={styles.categCount}>{categoria.tutoriales.length} tutoriales</Text>
            </View>
          </View>

          {categoria.tutoriales.map((tut) => (
            <TutorialCard key={tut.id} tutorial={tut} color={categoria.color} />
          ))}
        </View>

      </ScrollView>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

const cardShadow = Platform.select({
  ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 10 },
  android: { elevation: 2 },
}) ?? {};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  header: { flexDirection: "row", alignItems: "center", paddingTop: Platform.OS === "ios" ? 60 : 40, paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.md },
  backBtn: { width: 40, height: 40, borderRadius: RADIUS.full, backgroundColor: COLORS.surface, justifyContent: "center", alignItems: "center", ...cardShadow },
  headerTitle: { fontSize: 22, fontWeight: "800", color: COLORS.textPrimary, letterSpacing: -0.3 },
  headerSub: { fontSize: 13, color: COLORS.textSecondary, marginTop: 2 },

  tipDia: { marginHorizontal: SPACING.lg, marginBottom: SPACING.md, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.lg, padding: SPACING.md, borderWidth: 1, borderColor: "#C8EFD9" },
  tipDiaHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
  tipDiaLabel: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  tipDiaText: { fontSize: 13, color: COLORS.primaryDark, lineHeight: 19 },

  categScrollContent: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.md, gap: SPACING.sm },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  catChipText: { fontSize: 13, fontWeight: "600", color: COLORS.textSecondary },

  tutorialesSection: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  categHeader: { flexDirection: "row", alignItems: "center", gap: SPACING.md, borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  categIconWrap: { width: 40, height: 40, borderRadius: RADIUS.md, justifyContent: "center", alignItems: "center" },
  categTitle: { fontSize: 16, fontWeight: "700" },
  categCount: { fontSize: 12, color: COLORS.textSecondary, marginTop: 2 },

  tutCard: { backgroundColor: COLORS.surface, borderRadius: RADIUS.lg, marginBottom: SPACING.sm, overflow: "hidden", borderWidth: 1, borderColor: COLORS.border, ...cardShadow },
  tutCardHeader: { padding: SPACING.md },
  tutCardMeta: { flexDirection: "row", gap: SPACING.sm, marginBottom: SPACING.sm },
  nivelBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full },
  nivelText: { fontSize: 11, fontWeight: "700" },
  duracionBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  duracionText: { fontSize: 11, color: COLORS.textMuted },
  tutCardTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 },
  tutCardTitle: { fontSize: 15, fontWeight: "700", color: COLORS.textPrimary, flex: 1, letterSpacing: -0.2 },
  tutCardDesc: { fontSize: 12, color: COLORS.textSecondary, lineHeight: 17 },

  tutCarrusel: { paddingHorizontal: SPACING.md, paddingBottom: SPACING.md },
  tutPasosDivider: { height: 1, marginBottom: SPACING.md },

  slideArte: { height: 170, borderRadius: RADIUS.lg, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  slideImagen: { width: "100%", height: "100%" },
  deco: { position: "absolute", borderRadius: RADIUS.full },
  slideIconoWrap: { width: 96, height: 96, borderRadius: RADIUS.full, justifyContent: "center", alignItems: "center", ...cardShadow },
  slideContador: { position: "absolute", top: SPACING.sm + 2, left: SPACING.sm + 2, paddingHorizontal: SPACING.sm + 2, paddingVertical: 3, borderRadius: RADIUS.full },
  slideContadorText: { fontSize: 11, fontWeight: "800", color: "#FFF" },
  slideTexto: { paddingTop: SPACING.md, paddingHorizontal: SPACING.xs, minHeight: 92 },
  slideTitulo: { fontSize: 16, fontWeight: "800", marginBottom: 4, letterSpacing: -0.2 },
  slideDesc: { fontSize: 13, color: COLORS.textPrimary, lineHeight: 19 },

  carControles: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: SPACING.sm },
  carBtn: { width: 36, height: 36, borderRadius: RADIUS.full, justifyContent: "center", alignItems: "center", backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  carBtnOff: { backgroundColor: COLORS.background },
  dots: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: RADIUS.full, backgroundColor: COLORS.border },

  videoBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: SPACING.sm, marginTop: SPACING.md, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.full, borderWidth: 1 },
  videoBtnText: { fontSize: 13, fontWeight: "700" },
});