/**
 * CICLAPP — Login
 * app/login.tsx
 */

import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  login,
  registrar,
  restablecerContrasena,
  solicitarRecuperacionContrasena,
} from "../services/storage";
import KeyboardAwareScroll, { useKeyboardScroll } from "../components/keyboard-aware-scroll";

// ─────────────────────────────────────────────────────────────
// DIMENSIONES
// ─────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } =
  Dimensions.get("window");

// Se ajusta la composición para que el login quede más equilibrado y la tarjeta cubra el espacio restante sin dejar blanco visible
const HERO_HEIGHT = Math.min(SCREEN_HEIGHT * 0.52, 420);

// ─────────────────────────────────────────────────────────────
// DESIGN TOKENS
// ─────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#4E8534",
  primaryDark: "#3B6827",
  primaryLight: "#EAFAF1",
  background: "#FFFFFF",
  surface: "#FFFFFF",
  textPrimary: "#182619",
  textSecondary: "#5B5F5A",
  textMuted: "#9CA3AF",
  border: "#E8E0D5",
  inputBg: "#FCF4E9",
  danger: "#E74C3C",
} as const;

const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

const RADIUS = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  full: 999,
} as const;

// ─────────────────────────────────────────────────────────────
// COMPONENTE: CAMPO DE TEXTO
// ─────────────────────────────────────────────────────────────

type InputFieldProps = {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "email-address" | "numeric";
  autoCapitalize?: "none" | "words";
  maxLength?: number;
  onFocus?: () => void;
  onBlur?: () => void;
};

function InputField({
  icon,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = "default",
  autoCapitalize = "none",
  maxLength,
  onFocus,
  onBlur,
}: InputFieldProps) {
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);

  return (
    <View
      style={[
        styles.inputWrap,
        focused && styles.inputWrapFocused,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={COLORS.textMuted}
        style={styles.inputIcon}
      />

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
        secureTextEntry={
          secureTextEntry && !visible
        }
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        maxLength={maxLength}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
      />

      {secureTextEntry && (
        <TouchableOpacity
          onPress={() => setVisible(!visible)}
          hitSlop={8}
        >
          <Ionicons
            name={
              visible
                ? "eye-outline"
                : "eye-off-outline"
            }
            size={18}
            color={COLORS.textMuted}
          />
        </TouchableOpacity>
      )}
    </View>
  );
}

function PasswordRequirements({ password }: { password: string }) {
  const containerRef = useRef<View>(null);
  const keyboardScroll = useKeyboardScroll();

  // Al aparecer (al enfocar la contraseña) se desplaza para mostrar TODA la lista sobre el teclado.
  useEffect(() => {
    keyboardScroll?.scrollToElement(containerRef);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rules = [
    { label: "Al menos 8 caracteres", passed: password.length >= 8 },
    { label: "Un número", passed: /[0-9]/.test(password) },
    { label: "Una mayúscula", passed: /[A-Z]/.test(password) },
    { label: "Un símbolo", passed: /[^A-Za-z0-9]/.test(password) },
    { label: "Sin espacios", passed: !/\s/.test(password) },
  ];

  return (
    <View ref={containerRef} collapsable={false} style={styles.passwordRules}>
      <Text style={styles.passwordRulesTitle}>Tu contraseña debe tener:</Text>
      {rules.map((rule) => (
        <View key={rule.label} style={styles.passwordRule}>
          <Ionicons
            name={rule.passed ? "checkmark-circle" : "ellipse-outline"}
            size={15}
            color={rule.passed ? COLORS.primary : COLORS.textMuted}
          />
          <Text
            style={[
              styles.passwordRuleText,
              rule.passed && styles.passwordRulePassed,
            ]}
          >
            {rule.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE: SEPARADOR
// ─────────────────────────────────────────────────────────────

function BikeDivider() {
  return (
    <View style={styles.dividerRow}>
      <View style={styles.dividerLine} />

      <Ionicons
        name="bicycle-outline"
        size={16}
        color={COLORS.textMuted}
        style={{
          marginHorizontal: 10,
        }}
      />

      <View style={styles.dividerLine} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA LOGIN
// ─────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const [tab, setTab] =
    useState<"login" | "registro">("login");
  const [forgotMode, setForgotMode] = useState(false);
  const [resetStep, setResetStep] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [confirmarPass, setConfirmarPass] =
    useState("");

  const [aceptaTerminos, setAceptaTerminos] =
    useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ─────────────────────────────────────────────────────────
  // LOGIN / REGISTRO
  // ─────────────────────────────────────────────────────────

  const validarEmail = (valor: string) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor.trim());

  const validarContrasena = (valor: string) => {
    if (!valor.trim()) {
      return "La contraseña es obligatoria.";
    }
    if (/\s/.test(valor)) {
      return "La contraseña no puede contener espacios.";
    }
    if (valor.length < 8) {
      return "La contraseña debe tener al menos 8 caracteres.";
    }
    if (!/[0-9]/.test(valor)) {
      return "La contraseña debe tener al menos un número.";
    }
    if (!/[A-Z]/.test(valor)) {
      return "La contraseña debe tener al menos una mayúscula.";
    }
    if (!/[^A-Za-z0-9]/.test(valor)) {
      return "La contraseña debe tener al menos un símbolo.";
    }
    return "";
  };

  const handleSubmit = async () => {
    setError("");

    const emailTrim = email.trim();
    const nombreTrim = nombre.trim();

    if (forgotMode) {
      if (!emailTrim || !validarEmail(emailTrim)) {
        setError("Ingresa un correo electrónico válido.");
        return;
      }

      if (resetStep) {
        if (!/^\d{6}$/.test(resetCode)) {
          setError("Ingresa el código de 6 dígitos que recibiste por correo.");
          return;
        }
        const errorContrasena = validarContrasena(contrasena);
        if (errorContrasena) {
          setError(errorContrasena);
          return;
        }
      }

      setLoading(true);
      try {
        if (!resetStep) {
          await solicitarRecuperacionContrasena(emailTrim);
          setResetStep(true);
        } else {
          await restablecerContrasena(emailTrim, resetCode, contrasena);
          Alert.alert("Contraseña actualizada", "Ya puedes iniciar sesión con tu nueva contraseña.");
          setForgotMode(false);
          setResetStep(false);
          setResetCode("");
          setContrasena("");
          setPasswordFocused(false);
        }
      } catch (e: any) {
        setError(e?.message || "No se pudo completar la recuperación. Intenta de nuevo.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!emailTrim || !contrasena.trim()) {
      setError("Por favor completa todos los campos obligatorios.");
      return;
    }

    if (!validarEmail(emailTrim)) {
      setError("Ingresa un correo electrónico válido.");
      return;
    }

    if (tab === "registro") {
      if (!nombreTrim) {
        setError("Por favor ingresa tu nombre.");
        return;
      }

      if (!confirmarPass.trim()) {
        setError("Confirma tu contraseña para continuar.");
        return;
      }

      const errorContrasena = validarContrasena(contrasena);
      if (errorContrasena) {
        setError(errorContrasena);
        return;
      }

      if (contrasena !== confirmarPass) {
        setError("Las contraseñas no coinciden. Verifica que sean iguales.");
        return;
      }

      if (!aceptaTerminos) {
        setError("Debes aceptar los Términos y Condiciones.");
        return;
      }
    }

    setLoading(true);

    try {
      if (tab === "login") {
        // Login
        await login(
          email.trim(),
          contrasena
        );
      } else {
        // Registro
        await registrar(
          nombre.trim(),
          email.trim(),
          contrasena
        );
      }

      // Ir al Home
      router.replace("/(tabs)");
    } catch (e: any) {
      const message =
        typeof e === "string"
          ? e
          : e?.message ||
            e?.detail ||
            JSON.stringify(e) ||
            "Ocurrió un error. Intenta de nuevo.";

      setError(message);

      console.error(
        "Login error:",
        e
      );
    } finally {
      setLoading(false);
    }
  };

  const esLogin = tab === "login" && !forgotMode;

  // ─────────────────────────────────────────────────────────
  // CAMBIAR LOGIN / REGISTRO
  // ─────────────────────────────────────────────────────────

  const cambiarTab = (
    t: "login" | "registro"
  ) => {
    setTab(t);
    setForgotMode(false);
    setResetStep(false);
    setPasswordFocused(false);
    setError("");
  };

  // ─────────────────────────────────────────────────────────
  // INTERFAZ
  // ─────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <KeyboardAwareScroll
        containerStyle={styles.keyboardAvoid}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: 40 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >

        {/* ═══════════════════════════════════════════════
            FOTO SUPERIOR
        ═══════════════════════════════════════════════ */}

        <View style={styles.hero}>

          <Image
            source={
              esLogin || forgotMode
                ? require(
                    "../assets/images/login-hero.png"
                  )
                : require(
                    "../assets/images/registro-hero.png"
                  )
            }
            style={{
              width: "100%",
              height: "100%",
            }}
            resizeMode="cover"
          />

          {/* Contenido encima de la fotografía */}

          <View style={styles.heroContent}>

            {/* Botón regresar */}

            {!esLogin && !forgotMode && (
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() =>
                  cambiarTab("login")
                }
                hitSlop={10}
              >
                <Ionicons
                  name="arrow-back"
                  size={22}
                  color={COLORS.textPrimary}
                />
              </TouchableOpacity>
            )}

            {/* FRASE */}

            <View style={styles.heroTextWrap}>
              {forgotMode ? (
                <Text style={[styles.headline, styles.recoveryHeadline]}>
                  No te preocupes,{"\n"}
                  <Text style={styles.headlineAccent}>recuperar</Text>
                  {"\n"}tu acceso{"\n"}es posible.
                </Text>
              ) : (
                <Text style={styles.headline}>
                  conecta,{"\n"}
                  <Text style={styles.headlineAccent}>pedalea,</Text>
                  {"\n"}explora.
                </Text>
              )}

              <View style={styles.underline} />
              {!forgotMode && (
                <Text style={styles.subtitle}>
                  {esLogin ? "Inicia sesión y " : "Regístrate y "}
                  <Text style={styles.subtitleAccent}>sigue tu ruta</Text>
                </Text>
              )}
            </View>

          </View>
        </View>


        {/* ═══════════════════════════════════════════════
            TARJETA BLANCA
        ═══════════════════════════════════════════════ */}

        <View
          style={[
            styles.card,
            forgotMode
              ? styles.cardForgot
              : esLogin
                ? styles.cardLogin
                : styles.cardRegistro,
          ]}
        >

          {/* LOGO DE BICICLETA */}

          <View style={styles.badgeOuter}>
            <View style={styles.badgeInner}>
              <Ionicons
                name={forgotMode ? "lock-closed" : "bicycle"}
                size={30}
                color="#FFF"
              />
            </View>
          </View>


          {/* CONTENIDO DEL FORMULARIO */}

          <View
            style={[
              styles.cardBody,
              forgotMode
                ? styles.cardBodyForgot
                : esLogin
                  ? styles.cardBodyLogin
                  : styles.cardBodyRegistro,
            ]}
          >

            {/* ═════════════════════════════════════
                LOGIN
            ═════════════════════════════════════ */}

            {forgotMode ? (
              <>
                {!resetStep ? (
                  <>
                    <InputField
                      icon="mail-outline"
                      value={email}
                      onChangeText={setEmail}
                      placeholder="Correo electrónico"
                      keyboardType="email-address"
                    />
                    <Text style={styles.recoveryDescription}>
                      Te enviaremos un enlace para que puedas restablecer tu contraseña.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.recoveryDescription}>
                      Ingresa el código de verificación que enviamos a tu correo y crea una contraseña nueva.
                    </Text>
                    <InputField
                      icon="key-outline"
                      value={resetCode}
                      onChangeText={setResetCode}
                      placeholder="Código de verificación"
                      keyboardType="numeric"
                      maxLength={6}
                    />
                    <InputField
                      icon="lock-closed-outline"
                      value={contrasena}
                      onChangeText={setContrasena}
                      placeholder="Contraseña nueva"
                      secureTextEntry
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                    />
                    {passwordFocused && (
                      <PasswordRequirements password={contrasena} />
                    )}
                  </>
                )}
              </>
            ) : esLogin ? (
              <>

                <InputField
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Correo electrónico"
                  keyboardType="email-address"
                />

                <InputField
                  icon="lock-closed-outline"
                  value={contrasena}
                  onChangeText={setContrasena}
                  placeholder="Contraseña"
                  secureTextEntry
                />

                <TouchableOpacity
                  style={styles.forgotWrap}
                  hitSlop={6}
                  onPress={() => {
                    setForgotMode(true);
                    setResetStep(false);
                    setResetCode("");
                    setContrasena("");
                    setPasswordFocused(false);
                    setError("");
                  }}
                >
                  <Text
                    style={styles.forgotText}
                  >
                    ¿Olvidaste tu contraseña?
                  </Text>
                </TouchableOpacity>

              </>
            ) : (

              /* ═══════════════════════════════════
                 REGISTRO
              ═══════════════════════════════════ */

              <>

                <InputField
                  icon="person-outline"
                  value={nombre}
                  onChangeText={setNombre}
                  placeholder="Nombre completo"
                  autoCapitalize="words"
                />

                <InputField
                  icon="mail-outline"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Correo electrónico"
                  keyboardType="email-address"
                />

                <InputField
                  icon="lock-closed-outline"
                  value={contrasena}
                  onChangeText={setContrasena}
                  placeholder="Contraseña"
                  secureTextEntry
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                {passwordFocused && (
                  <PasswordRequirements password={contrasena} />
                )}

                <InputField
                  icon="lock-closed-outline"
                  value={confirmarPass}
                  onChangeText={
                    setConfirmarPass
                  }
                  placeholder="Confirmar contraseña"
                  secureTextEntry
                />

                {/* Términos */}

                <TouchableOpacity
                  style={styles.checkboxRow}
                  onPress={() =>
                    setAceptaTerminos(
                      !aceptaTerminos
                    )
                  }
                  hitSlop={6}
                >

                  <View
                    style={[
                      styles.checkbox,
                      aceptaTerminos &&
                        styles.checkboxChecked,
                    ]}
                  >
                    {aceptaTerminos && (
                      <Ionicons
                        name="checkmark"
                        size={13}
                        color="#FFF"
                      />
                    )}
                  </View>

                  <Text
                    style={styles.termsText}
                  >
                    Acepto los{" "}

                    <Text
                      style={styles.termsLink}
                    >
                      Términos y Condiciones
                    </Text>
                  </Text>

                </TouchableOpacity>

              </>
            )}


            {/* ═════════════════════════════════════
                ERROR
            ═════════════════════════════════════ */}

            {!!error && (
              <View
                style={styles.errorBox}
              >

                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={COLORS.danger}
                />

                <Text
                  style={styles.errorText}
                >
                  {error}
                </Text>

              </View>
            )}


            {/* ═════════════════════════════════════
                BOTÓN PRINCIPAL
            ═════════════════════════════════════ */}

            <TouchableOpacity
              style={[
                styles.btnPrimary,
                loading && {
                  opacity: 0.7,
                },
              ]}
              onPress={handleSubmit}
              disabled={loading}
              activeOpacity={0.85}
            >

              {loading ? (
                <ActivityIndicator
                  color="#FFF"
                />
              ) : (
                <Text
                  style={
                    styles.btnPrimaryText
                  }
                >
                  {forgotMode
                    ? resetStep
                      ? "Restablecer contraseña"
                      : "Enviar enlace"
                    : esLogin
                      ? "Inicia sesión"
                      : "Regístrate"}
                </Text>
              )}

            </TouchableOpacity>


            {/* Separador */}

            <BikeDivider />


            {/* ═════════════════════════════════════
                CAMBIAR LOGIN / REGISTRO
            ═════════════════════════════════════ */}

            {forgotMode ? (
              <TouchableOpacity
                style={styles.switchTabRow}
                onPress={() => {
                  setForgotMode(false);
                  setResetStep(false);
                  setPasswordFocused(false);
                  setError("");
                }}
              >
                <Text style={[styles.switchTabText, styles.switchTabTextBold]}>
                  ← Volver al inicio de sesión
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.switchTabRow}
                onPress={() => cambiarTab(esLogin ? "registro" : "login")}
              >
                <Text style={styles.switchTabText}>
                  {esLogin ? "¿No tienes cuenta? " : "¿Ya tienes cuenta? "}
                  <Text style={styles.switchTabTextBold}>
                    {esLogin ? "Registrarse" : "Inicia sesión"}
                  </Text>
                </Text>
              </TouchableOpacity>
            )}

          </View>


        </View>

      </KeyboardAwareScroll>
    </View>
  );
}


// ═════════════════════════════════════════════════════════════
// SOMBRA DE LA TARJETA
// ═════════════════════════════════════════════════════════════

const cardShadow =
  Platform.select({

    ios: {
      shadowColor: "#000",

      shadowOffset: {
        width: 0,
        height: -4,
      },

      shadowOpacity: 0.1,

      shadowRadius: 16,
    },

    android: {
      elevation: 8,
    },

  }) ?? {};


// ═════════════════════════════════════════════════════════════
// ESTILOS
// ═════════════════════════════════════════════════════════════

const styles = StyleSheet.create({

  // ─────────────────────────────────────────────────────────
  // GENERAL
  // ─────────────────────────────────────────────────────────

  root: {
    flex: 1,
    backgroundColor:
      COLORS.background,
  },

  keyboardAvoid: {
    flex: 1,
  },

  scroll: {
    flexGrow: 1,
    minHeight: SCREEN_HEIGHT,
  },


  // ─────────────────────────────────────────────────────────
  // FOTO SUPERIOR
  // ─────────────────────────────────────────────────────────

  hero: {
    width: "100%",

    height: HERO_HEIGHT,

    backgroundColor: "#DDD",
  },

  /*
   * IMPORTANTE:
   * Este contenido está encima de la fotografía.
   * Así la frase "conecta, pedalea, explora."
   * vuelve a aparecer.
   */

  heroContent: {
    position: "absolute",

    top: 0,
    left: 0,
    right: 0,
    bottom: 0,

    paddingTop:
      SCREEN_HEIGHT * 0.07,

    paddingLeft: 20,
    paddingRight: 20,

    justifyContent:
      "flex-start",
  },

  heroTextWrap: {
    width: "100%",
  },

  backBtn: {
    marginBottom:
      SPACING.sm,

    width: 34,
    height: 34,

    borderRadius: 17,

    justifyContent: "center",
    alignItems: "center",

    backgroundColor:
      "rgba(255,255,255,0.85)",
  },


  // ─────────────────────────────────────────────────────────
  // FRASE PRINCIPAL
  // ─────────────────────────────────────────────────────────

  headline: {
    fontSize: 42,

    fontWeight: "900",

    color: "#F5F3EE",

    lineHeight: 44,

    letterSpacing: -1,

    textShadowColor:
      "rgba(0,0,0,0.28)",

    textShadowOffset: {
      width: 0,
      height: 2,
    },

    textShadowRadius: 10,
  },

  headlineAccent: {
    color: "#93D47D",
  },

  recoveryHeadline: {
    fontSize: Math.min(36, SCREEN_WIDTH * 0.095),
    lineHeight: Math.min(42, SCREEN_WIDTH * 0.11),
    fontWeight: "700",
    letterSpacing: -0.5,
  },

  underline: {
    width: 52,

    height: 4,

    borderRadius: 2,

    backgroundColor:
      COLORS.primary,

    marginTop: 10,

    marginBottom: 12,
  },

  subtitle: {
    fontSize: 17,

    color: "#F5F3EE",

    textShadowColor:
      "rgba(0,0,0,0.35)",

    textShadowOffset: {
      width: 0,
      height: 1,
    },

    textShadowRadius: 6,
  },

  subtitleAccent: {
    color: "#9BE37A",

    fontWeight: "600",
  },


  // ─────────────────────────────────────────────────────────
  // TARJETA BLANCA
  // ─────────────────────────────────────────────────────────

  card: {
    backgroundColor:
      COLORS.surface,

    borderTopLeftRadius: 30,

    borderTopRightRadius: 30,

    width: SCREEN_WIDTH,

    minHeight:
      Math.max(
        SCREEN_HEIGHT - HERO_HEIGHT + 26,
        440
      ),

    /*
     * Visible permite que el logo sobresalga.
     */
    overflow: "visible",

    ...cardShadow,
  },

  cardLogin: {
    marginTop: -20,
  },

  cardRegistro: {
    marginTop: -18,
  },

  cardForgot: {
    marginTop: -20,
  },

  // ─────────────────────────────────────────────────────────
  // CONTENIDO
  // ─────────────────────────────────────────────────────────

  cardBody: {
    paddingHorizontal: 22,
    paddingBottom: 16,
  },

  cardBodyLogin: {
    paddingTop: 58,
    paddingBottom: 20,
  },

  cardBodyRegistro: {
    paddingTop: 48,
  },

  cardBodyForgot: {
    paddingTop: 58,
  },

  // ─────────────────────────────────────────────────────────
  // LOGO DE BICICLETA
  // ─────────────────────────────────────────────────────────

  badgeOuter: {
    position: "absolute",

    top: -20,

    alignSelf: "center",

    zIndex: 3,

    width: 72,

    height: 72,

    borderRadius: 36,

    backgroundColor: "#FFF",

    justifyContent: "center",

    alignItems: "center",

    ...Platform.select({

      ios: {
        shadowColor: "#000",

        shadowOffset: {
          width: 0,
          height: 3,
        },

        shadowOpacity: 0.15,

        shadowRadius: 6,
      },

      android: {
        elevation: 5,
      },

    }),
  },

  badgeInner: {
    width: 60,

    height: 60,

    borderRadius: 30,

    backgroundColor:
      COLORS.primary,

    justifyContent: "center",

    alignItems: "center",
  },


  // ─────────────────────────────────────────────────────────
  // CAMPOS
  // ─────────────────────────────────────────────────────────

  inputWrap: {
    flexDirection: "row",

    alignItems: "center",

    borderWidth: 1.5,

    borderColor:
      COLORS.border,

    borderRadius: 18,

    paddingHorizontal: 14,

    height: 54,

    gap: 8,

    backgroundColor:
      COLORS.inputBg,

    marginBottom: 12,
  },

  inputWrapFocused: {
    borderColor:
      COLORS.primary,

    backgroundColor:
      COLORS.primaryLight,
  },

  inputIcon: {
    marginRight: 2,
  },

  input: {
    flex: 1,

    fontSize: 15,

    color:
      COLORS.textPrimary,
    paddingVertical: 0,
  },

  passwordRules: {
    backgroundColor: "#F6F9F3",
    borderRadius: RADIUS.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -5,
    marginBottom: 12,
  },

  passwordRulesTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.textPrimary,
    marginBottom: 5,
  },

  passwordRule: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 3,
  },

  passwordRuleText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },

  passwordRulePassed: {
    color: COLORS.primaryDark,
  },

  recoveryDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: COLORS.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },


  // ─────────────────────────────────────────────────────────
  // OLVIDÉ MI CONTRASEÑA
  // ─────────────────────────────────────────────────────────

  forgotWrap: {
    alignItems: "flex-end",

    marginBottom: 18,

    marginTop: 2,
  },

  forgotText: {
    fontSize: 14,

    color:
      COLORS.primary,

    fontWeight: "600",
  },


  // ─────────────────────────────────────────────────────────
  // CHECKBOX
  // ─────────────────────────────────────────────────────────

  checkboxRow: {
    flexDirection: "row",

    alignItems: "center",

    gap: SPACING.sm,

    marginBottom:
      SPACING.lg,

    marginTop:
      SPACING.xs,
  },

  checkbox: {
    width: 20,

    height: 20,

    borderRadius: 5,

    borderWidth: 1.5,

    borderColor:
      COLORS.border,

    justifyContent: "center",

    alignItems: "center",
  },

  checkboxChecked: {
    backgroundColor:
      COLORS.primary,

    borderColor:
      COLORS.primary,
  },

  termsText: {
    fontSize: 13,

    color:
      COLORS.textSecondary,

    flexShrink: 1,
  },

  termsLink: {
    color:
      COLORS.primary,

    fontWeight: "600",
  },


  // ─────────────────────────────────────────────────────────
  // ERROR
  // ─────────────────────────────────────────────────────────

  errorBox: {
    flexDirection: "row",

    alignItems: "center",

    gap: SPACING.sm,

    backgroundColor:
      "#FDEDEC",

    borderRadius:
      RADIUS.sm,

    padding:
      SPACING.sm,

    marginBottom:
      SPACING.md,
  },

  errorText: {
    fontSize: 12,

    color:
      COLORS.danger,

    flex: 1,
  },


  // ─────────────────────────────────────────────────────────
  // BOTÓN PRINCIPAL
  // ─────────────────────────────────────────────────────────

  btnPrimary: {
    backgroundColor:
      COLORS.primary,

    borderRadius: 18,

    height: 54,

    justifyContent: "center",

    alignItems: "center",

    marginTop: 2,

    ...Platform.select({

      ios: {
        shadowColor:
          COLORS.primaryDark,

        shadowOffset: {
          width: 0,
          height: 4,
        },

        shadowOpacity: 0.25,

        shadowRadius: 8,
      },

      android: {
        elevation: 5,
      },

    }),
  },

  btnPrimaryText: {
    fontSize: 15,

    fontWeight: "700",

    color: "#FFF",

    letterSpacing: 0.5,

    textTransform: "uppercase",
  },


  // ─────────────────────────────────────────────────────────
  // SEPARADOR
  // ─────────────────────────────────────────────────────────

  dividerRow: {
    flexDirection: "row",

    alignItems: "center",

    marginTop: 18,

    marginBottom: 16,
  },

  dividerLine: {
    flex: 1,

    height: 1,

    backgroundColor:
      COLORS.border,
  },


  // ─────────────────────────────────────────────────────────
  // CAMBIAR LOGIN / REGISTRO
  // ─────────────────────────────────────────────────────────

  switchTabRow: {
    alignItems: "center",
  },

  switchTabText: {
    fontSize: 14,

    color:
      COLORS.textPrimary,
  },

  switchTabTextBold: {
    color:
      COLORS.primary,

    fontWeight: "700",
  },

});