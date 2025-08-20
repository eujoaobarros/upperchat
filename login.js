// Configuração do Firebase
const firebaseConfig = {
    apiKey: "AIzaSyAn-mbkw78N_fVJv1T6HZixrXJ-Jp81TRM",
    authDomain: "upperchat-e8f27.firebaseapp.com",
    projectId: "upperchat-e8f27",
    storageBucket: "upperchat-e8f27.firebasestorage.app",
    messagingSenderId: "678452255905",
    appId: "1:678452255905:web:fdf2da2ba7f91fdf60a4e0",
    measurementId: "G-6LMK2TGNXW"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

// Objeto com mensagens de erro traduzidas
const errorMessages = {
    'auth/invalid-email': 'O endereço de e-mail não é válido.',
    'auth/user-disabled': 'Esta conta foi desativada por um administrador.',
    'auth/user-not-found': 'Não existe uma conta com este e-mail.',
    'auth/wrong-password': 'Senha incorreta.',
    'auth/invalid-login-credentials': 'E-mail ou senha incorretos. Verifique suas credenciais.',
    'auth/too-many-requests': 'Muitas tentativas de login. Tente novamente mais tarde.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    'auth/operation-not-allowed': 'Este método de login não está habilitado.',
    'default': 'Ocorreu um erro inesperado. Tente novamente.'
};

document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    const showPasswordBtn = document.getElementById('showPassword');
    const passwordInput = document.getElementById('password');
    const registerLink = document.getElementById('registerLink');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const loading = document.getElementById('loading');
    const successMessage = document.getElementById('successMessage');
    const forgotPasswordLink = document.querySelector('.forgot-password');

    // Verificar se há um usuário logado
    auth.onAuthStateChanged(function(user) {
        if (user) {
            // Usuário está logado, redirecionar para a página principal
            window.location.href = 'chat.html';
        }
    });

    // Mostrar/esconder senha
    showPasswordBtn.addEventListener('click', function() {
        const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordInput.setAttribute('type', type);
        this.innerHTML = type === 'password' ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    });

    // Validação do formulário
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const rememberMe = document.getElementById('rememberMe').checked;

        // Reset mensagens de erro
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
        successMessage.style.display = 'none';

        // Validação básica
        let isValid = true;
        
        if (!email) {
            emailError.textContent = 'Por favor, insira seu e-mail';
            emailError.style.display = 'block';
            isValid = false;
        } else if (!isValidEmail(email)) {
            emailError.textContent = 'Por favor, insira um e-mail válido';
            emailError.style.display = 'block';
            isValid = false;
        }

        if (!password) {
            passwordError.textContent = 'Por favor, insira sua senha';
            passwordError.style.display = 'block';
            isValid = false;
        } else if (password.length < 6) {
            passwordError.textContent = 'A senha deve ter pelo menos 6 caracteres';
            passwordError.style.display = 'block';
            isValid = false;
        }

        if (!isValid) return;

        // Mostrar loading
        loading.style.display = 'block';

        // Fazer login com Firebase
        auth.signInWithEmailAndPassword(email, password)
            .then((userCredential) => {
                // Login bem-sucedido
                const user = userCredential.user;
                
                // Se "Lembrar de mim" estiver marcado, persistir a autenticação
                const persistence = rememberMe ? 
                    firebase.auth.Auth.Persistence.LOCAL : 
                    firebase.auth.Auth.Persistence.SESSION;
                
                auth.setPersistence(persistence)
                    .then(() => {
                        showSuccess();
                    })
                    .catch((error) => {
                        console.error("Erro ao definir persistência: ", error);
                        showSuccess();
                    });
            })
            .catch((error) => {
                // Ocultar loading
                loading.style.display = 'none';
                
                // Tratar erros
                handleAuthError(error);
            });
            
        function showSuccess() {
            successMessage.style.display = 'block';
            loading.style.display = 'none';
            
            // Redirecionar após breve delay
            setTimeout(() => {
                window.location.href = 'index.html';
            }, 2000);
        }
    });

    // Função para tratar erros de autenticação
    function handleAuthError(error) {
        const errorCode = error.code;
        const errorMessage = errorMessages[errorCode] || errorMessages['default'];
        
        // Determinar se o erro é relacionado ao email ou senha
        if (errorCode === 'auth/invalid-email' || errorCode === 'auth/user-disabled' || 
            errorCode === 'auth/user-not-found') {
            emailError.textContent = errorMessage;
            emailError.style.display = 'block';
        } else if (errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-login-credentials') {
            passwordError.textContent = errorMessage;
            passwordError.style.display = 'block';
        } else {
            // Para erros gerais, mostrar no campo de senha
            passwordError.textContent = errorMessage;
            passwordError.style.display = 'block';
        }
        
        console.error("Erro de autenticação: ", error);
    }

    // Função para validar formato de e-mail
    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    // Link para cadastro
    registerLink.addEventListener('click', function(e) {
        e.preventDefault();
        alert('Funcionalidade de cadastro será implementada em breve!');
    });

    // Link para recuperação de senha
    forgotPasswordLink.addEventListener('click', function(e) {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        
        if (!email) {
            emailError.textContent = 'Por favor, digite seu e-mail para redefinir a senha';
            emailError.style.display = 'block';
            return;
        }
        
        if (!isValidEmail(email)) {
            emailError.textContent = 'Por favor, insira um e-mail válido';
            emailError.style.display = 'block';
            return;
        }
        
        // Reset mensagens de erro
        emailError.style.display = 'none';
        
        auth.sendPasswordResetEmail(email)
            .then(() => {
                alert('E-mail de redefinição de senha enviado! Verifique sua caixa de entrada e spam.');
            })
            .catch((error) => {
                handleAuthError(error);
            });
    });
});