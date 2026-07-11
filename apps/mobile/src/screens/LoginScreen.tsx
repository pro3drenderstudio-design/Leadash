import React, { useState } from "react";
import { View, Text, TextInput, KeyboardAvoidingView, Platform, Image } from "react-native";
import { supabase } from "../lib/supabase";
import { R, FONT } from "../theme/tokens";
import { useTheme } from "../theme/ThemeContext";
import { Btn } from "../components/ui";

export default function LoginScreen() {
  const { C } = useTheme();
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function signIn() {
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }
    setLoading(true);
    setError("");
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    email.trim().toLowerCase(),
      password,
    });
    setLoading(false);
    if (err) setError(err.message);
    // Success: the auth state listener in App.tsx switches to the app stack.
  }

  const inputStyle = {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.borderStrong,
    borderRadius: R.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FONT.regular,
    color: C.text,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={{ flex: 1, backgroundColor: C.bg, justifyContent: "center", padding: 24 }}
    >
      <View style={{ marginBottom: 36, alignItems: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Image source={require("../../assets/logo-mark.png")} style={{ width: 32, height: 32 }} resizeMode="contain" />
          <Text style={{ fontSize: 28, fontFamily: FONT.bold, color: C.text, letterSpacing: -0.5 }}>Leadash</Text>
        </View>
        <Text style={{ fontSize: 13, fontFamily: FONT.regular, color: C.textQuiet, marginTop: 10 }}>
          Sign in to your workspace
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <TextInput
          style={inputStyle}
          placeholder="Email"
          placeholderTextColor={C.textQuiet}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
        />
        <TextInput
          style={inputStyle}
          placeholder="Password"
          placeholderTextColor={C.textQuiet}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
          onSubmitEditing={signIn}
        />
        {error ? <Text style={{ color: C.danger, fontSize: 12.5, fontFamily: FONT.medium }}>{error}</Text> : null}
        <Btn label="Sign in" onPress={signIn} loading={loading} style={{ marginTop: 4 }} />
        <Text style={{ color: C.textQuiet, fontSize: 12, fontFamily: FONT.regular, textAlign: "center", marginTop: 12 }}>
          Forgot your password? Reset it at leadash.com
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
