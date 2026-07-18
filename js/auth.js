import { initializeApp } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-analytics.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js";
import { showToast, showLoading } from '../js/toast-notification.js';

const firebaseConfig = {
 apiKey: "AIzaSyAATExPAdi27kKvuvU0ujf6f2QqR8JWwTg",
  authDomain: "tech-wizards-academy.firebaseapp.com",
  projectId: "tech-wizards-academy",
  storageBucket: "tech-wizards-academy.firebasestorage.app",
  messagingSenderId: "155089680506",
  appId: "1:155089680506:web:bd1909e4cc8e85b09663c3",
  measurementId: "G-1JCG9GLV37"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

// ====================================================================
// SIGNUP HANDLER
// ====================================================================
const signupForm = document.getElementById('signup-form');
const signupBtn = document.getElementById('signup-btn');

if (signupForm && signupBtn) {
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const phone = document.getElementById('phone').value.trim();
    const course = document.getElementById('course-selection').value || '';
    const alert_container = document.getElementById('signup-result');
    
    // Validate form values
    if (!firstName || !lastName || !email || !password || !phone) {
      if (alert_container) alert_container.textContent = 'Please fill in all required fields.';
      showToast('Please fill in all required fields', 'error');
      return;
    }

    // Show loading
    const originalText = signupBtn.textContent;
    signupBtn.disabled = true;
    signupBtn.textContent = 'Creating account...';
    const dismissLoading = showLoading('Creating your account...');

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      const userData = {
        firstName,
        lastName,
        email,
        phone,
        preferredCourse: course,
        enrolledCourses: [],
        role: 'student',
        createdAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, 'user', user.uid), userData);
        console.log('✅ User profile created:', user.uid);
      } catch (fireErr) {
        console.error('❌ Failed to write user doc:', fireErr);
        
        // Try to clean up auth user
        try {
          await user.delete();
        } catch (delErr) {
          console.error('Failed to delete auth user:', delErr);
        }
        
        dismissLoading();
        signupBtn.disabled = false;
        signupBtn.textContent = originalText;
        
        const msg = 'Signup failed: Could not create user profile.';
        if (alert_container) alert_container.textContent = msg;
        showToast(msg, 'error');
        return;
      }

      // Dismiss loading
      dismissLoading();

      // ⭐ SIMPLE: ALWAYS GO TO DASHBOARD
      // The dashboard will check localStorage for pending enrollment
      console.log('✅ Account created successfully, redirecting to dashboard...');
      showToast('Account created successfully! Redirecting...', 'success');
      
      setTimeout(() => { 
        window.location.href = '/students/dashboard.html'; 
      }, 1000);

    } catch (error) {
      // Dismiss loading
      dismissLoading();

      // Reset button
      signupBtn.disabled = false;
      signupBtn.textContent = originalText;

      console.error('Signup error:', error);
      
      // Better error messages
      let errorMsg = 'Signup failed: ' + error.message;
      
      if (error.code === 'auth/email-already-in-use') {
        errorMsg = 'That email is already in use. Please login instead.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Invalid email address.';
      } else if (error.code === 'auth/weak-password') {
        errorMsg = 'Password should be at least 6 characters.';
      }
      
      if (alert_container) alert_container.textContent = errorMsg;
      showToast(errorMsg, 'error');
    }
  });
}

// ====================================================================
// LOGIN HANDLER
// ====================================================================
const loginForm = document.getElementById('login-form');
const loginBtn = document.getElementById('login-btn');
  
if (loginForm && loginBtn) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const log_in_email = document.getElementById('log-in-email').value.trim();
    const log_in_password = document.getElementById('log-in-password').value.trim();
    const alert_container = document.getElementById('login-result');

    if (!log_in_email || !log_in_password) {
      if (alert_container) alert_container.textContent = 'Please fill in your credentials.';
      showToast('Please enter email and password', 'error');
      return;
    }

    // Show loading
    const originalText = loginBtn.textContent;
    loginBtn.disabled = true;
    loginBtn.textContent = 'Logging in...';
    const dismissLoading = showLoading('Logging you in...');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, log_in_email, log_in_password);
      const user = userCredential.user;

      // Fetch user role from Firestore
      const userDocRef = doc(db, 'user', user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        console.error('User document not found');
        if (alert_container) alert_container.textContent = 'User profile not found. Please contact support.';
        showToast('User profile not found', 'error');
        
        dismissLoading();
        loginBtn.disabled = false;
        loginBtn.textContent = originalText;
        return;
      }

      const userData = userDocSnap.data();
      const userRole = userData.role;

      // Dismiss loading
      dismissLoading();

      console.log('✅ Login successful');
      showToast('Login successful!', 'success');
      
      // ⭐ SIMPLE: ROLE-BASED REDIRECT ONLY
      // Dashboard will handle pending enrollment
      setTimeout(() => {
        if (userRole === 'admin') {
          window.location.href = '/tech wizzards admin dashboard/dashboard.html';
        } else {
          window.location.href = '/students/dashboard.html';
        }
      }, 500);

    } catch (error) {
      // Dismiss loading
      dismissLoading();

      // Reset button
      loginBtn.disabled = false;
      loginBtn.textContent = originalText;

      console.error('Login error:', error);
      
      // Better error messages
      let errorMsg = error.message;
      
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMsg = 'Incorrect email or password.';
      } else if (error.code === 'auth/user-not-found') {
        errorMsg = 'No account found with this email.';
      } else if (error.code === 'auth/invalid-email') {
        errorMsg = 'Invalid email address.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMsg = 'Too many failed attempts. Please try again later.';
      }
      
      if (alert_container) alert_container.textContent = errorMsg;
      showToast(errorMsg, 'error');
    }
  });
}

console.log('✅ Auth system loaded (simplified version)');
