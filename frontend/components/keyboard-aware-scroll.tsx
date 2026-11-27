/**
 * KeyboardAwareScroll
 *
 * Contenedor reutilizable para pantallas con formularios. Soluciona que el teclado
 * virtual tape los campos de texto en Android e iOS, sin librerías nativas extra
 * (funciona en Expo Go).
 *
 * Cómo funciona:
 *  1. KeyboardAvoidingView con behavior="padding" en AMBAS plataformas. En Android el
 *     modo `undefined` solo funciona si la ventana se redimensiona (adjustResize), y con
 *     edge-to-edge (Expo SDK 53+) ya no lo hace, por eso el teclado tapaba el formulario.
 *     Si el sistema sí redimensiona la ventana, KAV detecta que ya no hay solape y no duplica.
 *  2. ScrollView interno: el formulario se puede desplazar mientras el teclado está abierto.
 *  3. Al abrirse el teclado (y al tocar otro campo) se hace scroll animado hasta dejar el
 *     campo enfocado visible, con un pequeño margen para ver lo que se escribe.
 *  4. El offset del KAV se calcula solo (cabecera nativa, barra de estado, etc.).
 *
 * Uso:
 *   <KeyboardAwareScroll containerStyle={styles.root} contentContainerStyle={styles.scroll}>
 *     ...campos...
 *   </KeyboardAwareScroll>
 */
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  ScrollViewProps,
  StyleProp,
  TextInput,
  View,
  ViewStyle,
} from "react-native";

/** Permite a un bloque (p. ej. la lista de requisitos de contraseña) pedir que se vea completo. */
interface KeyboardScrollContextValue {
  scrollToElement: (ref: React.RefObject<View | null>) => void;
}
const KeyboardScrollContext = createContext<KeyboardScrollContextValue | null>(null);

/**
 * Llama a `scrollToElement(ref)` cuando un bloque aparece (por ejemplo al enfocar la contraseña)
 * para que se desplace lo necesario y el bloque completo quede por encima del teclado,
 * sin sacar de pantalla el campo que se está escribiendo.
 */
export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}

export interface KeyboardAwareScrollProps extends ScrollViewProps {
  /** Estilo del contenedor externo (KeyboardAvoidingView). Por defecto flex: 1. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Si no se indica, se calcula automáticamente según la posición en pantalla. */
  keyboardVerticalOffset?: number;
  /** Espacio (px) que se deja entre el campo enfocado y el borde del teclado. */
  extraScrollHeight?: number;
}

const KeyboardAwareScroll = forwardRef<ScrollView, KeyboardAwareScrollProps>(function KeyboardAwareScroll(
  {
    children,
    containerStyle,
    keyboardVerticalOffset,
    extraScrollHeight = 24,
    contentContainerStyle,
    onScroll,
    onTouchEnd,
    ...scrollProps
  },
  forwardedRef
) {
  const scrollRef = useRef<ScrollView>(null);
  const containerRef = useRef<View>(null);
  const offsetY = useRef(0);
  const layoutY = useRef(0);
  const [autoOffset, setAutoOffset] = useState(0);

  useImperativeHandle(forwardedRef, () => scrollRef.current as ScrollView);

  // Offset automático = posición absoluta del contenedor − posición relativa a su padre.
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    layoutY.current = e.nativeEvent.layout.y;
    containerRef.current?.measureInWindow?.((_x, y) => {
      if (typeof y === "number" && !Number.isNaN(y)) {
        setAutoOffset(Math.max(0, Math.round(y - layoutY.current)));
      }
    });
  }, []);

  const scrollToFocusedInput = useCallback(() => {
    const input = (TextInput as any).State?.currentlyFocusedInput?.();
    const scroll = scrollRef.current as any;
    if (!input?.measureInWindow || !scroll?.measureInWindow) return;

    input.measureInWindow((_ix: number, iy: number, _iw: number, ih: number) => {
      scroll.measureInWindow((_sx: number, sy: number, _sw: number, sh: number) => {
        const inputBottom = iy + ih + extraScrollHeight;
        const inputTop = iy - extraScrollHeight;
        const viewBottom = sy + sh;
        if (inputBottom > viewBottom) {
          scrollRef.current?.scrollTo({ y: offsetY.current + (inputBottom - viewBottom), animated: true });
        } else if (inputTop < sy) {
          scrollRef.current?.scrollTo({ y: Math.max(0, offsetY.current - (sy - inputTop)), animated: true });
        }
      });
    });
  }, [extraScrollHeight]);

  const scrollToElement = useCallback(
    (ref: React.RefObject<View | null>) => {
      const run = () => {
        const el = ref.current as any;
        const scroll = scrollRef.current as any;
        if (!el?.measureInWindow || !scroll?.measureInWindow) return;
        el.measureInWindow((_x: number, ey: number, _w: number, eh: number) => {
          scroll.measureInWindow((_sx: number, sy: number, _sw: number, sh: number) => {
            let delta = ey + eh + extraScrollHeight - (sy + sh); // lo que falta para ver el bloque entero
            if (delta <= 0) return;
            // Sin tapar el campo enfocado: su parte superior debe seguir a la vista.
            const input = (TextInput as any).State?.currentlyFocusedInput?.();
            if (input?.measureInWindow) {
              input.measureInWindow((_ix: number, iy: number) => {
                const maxDelta = iy - extraScrollHeight - sy;
                delta = Math.min(delta, Math.max(0, maxDelta));
                if (delta > 0) scrollRef.current?.scrollTo({ y: offsetY.current + delta, animated: true });
              });
            } else {
              scrollRef.current?.scrollTo({ y: offsetY.current + delta, animated: true });
            }
          });
        });
      };
      // El teclado tarda en abrirse y el área visible se encoge: se reintenta mientras termina.
      [60, 300, 650].forEach((ms) => setTimeout(run, ms));
    },
    [extraScrollHeight]
  );

  // Cuando el teclado termina de abrirse, el área visible ya se encogió: ahora sí medimos.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      timers.push(setTimeout(scrollToFocusedInput, 30));
      timers.push(setTimeout(scrollToFocusedInput, 250)); // reintento por si el layout tardó
    });
    return () => {
      sub.remove();
      timers.forEach(clearTimeout);
    };
  }, [scrollToFocusedInput]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    offsetY.current = e.nativeEvent.contentOffset.y;
    onScroll?.(e);
  };

  // Si el teclado ya está abierto y el usuario toca otro campo, no hay evento de teclado.
  const handleTouchEnd = (e: any) => {
    onTouchEnd?.(e);
    if (Keyboard.isVisible?.()) setTimeout(scrollToFocusedInput, 120);
  };

  return (
    <KeyboardAvoidingView
      ref={containerRef}
      style={[{ flex: 1 }, containerStyle]}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset ?? autoOffset}
      onLayout={handleLayout}
    >
      <KeyboardScrollContext.Provider value={{ scrollToElement }}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        {...scrollProps}
        contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
        onScroll={handleScroll}
        onTouchEnd={handleTouchEnd}
      >
        {children}
      </ScrollView>
      </KeyboardScrollContext.Provider>
    </KeyboardAvoidingView>
  );
});

export default KeyboardAwareScroll;
