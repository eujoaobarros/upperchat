// Configuração do Supabase (deve ser carregado antes de salvarcontato.js)
console.log("Inicializando Supabase...");

const supabaseUrl = 'https://igjiltchdrkewhnjdrpu.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlnamlsdGNoZHJrZXdobmpkcnB1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU0MDcyNTYsImV4cCI6MjA3MDk4MzI1Nn0.H7rKPPynAwLPcB0YFm3xar06-7XwYgwZ__1fNzol_6I';


try {
    const supabase = supabase.createClient(supabaseUrl, supabaseKey);
    window.supabase = supabase; // Disponibiliza globalmente
    console.log("Supabase inicializado com sucesso!");
} catch (error) {
    console.error("Erro ao inicializar Supabase:", error);
    window.supabaseError = error;
}