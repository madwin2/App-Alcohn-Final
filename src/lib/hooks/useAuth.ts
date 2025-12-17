import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuchar cambios en la autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    if (!data.user) throw new Error('No se pudo iniciar sesión');

    // Verificar si el usuario está autorizado
    const { isUserAuthorized } = await import('../supabase/services/auth.service');
    const authorized = await isUserAuthorized(data.user.id);

    if (!authorized) {
      // Cerrar sesión si no está autorizado
      await supabase.auth.signOut();
      throw new Error('Tu cuenta está pendiente de aprobación. Contacta al administrador.');
    }

    return data;
  };

  const signUp = async (email: string, password: string, metadata?: { nombre?: string; apellido?: string }) => {
    // Registrar usuario en Supabase Auth
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        emailRedirectTo: undefined, // No redirigir automáticamente
      },
    });

    if (error) throw error;
    if (!data.user) throw new Error('No se pudo crear el usuario');

    // Crear solicitud de registro pendiente
    const { createRegistrationRequest } = await import('../supabase/services/auth.service');
    await createRegistrationRequest(data.user.id, email, metadata);

    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  };

  return {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    isAuthenticated: !!user,
  };
};

