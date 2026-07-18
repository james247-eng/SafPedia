
// ====================================================================
// STUDENT DASHBOARD - Multi-Lesson System (FIXED v4 - Direct Checkout)
// Tech Wizards Academy
// ====================================================================

import { auth, db } from '../../firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-auth.js';
import { doc, getDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';

// ====================================================================
// GLOBAL VARIABLES
// ====================================================================
let currentUser = null;
let enrolledCourses = [];
let isLoadingCourses = false;

// ====================================================================
// AUTHENTICATION CHECK
// ====================================================================
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../sign-in.html';
    return;
  }

  currentUser = user;
  console.log('✅ User authenticated:', user.email);

  try {
    const userDoc = await getDoc(doc(db, 'user', user.uid));
    const profile = userDoc.exists() ? userDoc.data() : {};
    
    const firstName = profile.firstName || user.email.split('@')[0];
    const welcomeText = document.getElementById('welcome-text');
    if (welcomeText) {
      welcomeText.textContent = `Welcome back, ${firstName}! 👋`;
    }
    
    await loadUserCourses();
    
    // ⭐ Check for pending enrollment after login (DIRECT CHECKOUT)
    await checkPendingEnrollment();
    
  } catch (error) {
    console.error('❌ Error loading profile:', error);
    showError('Error loading your profile. Please refresh the page.');
  }
});

// ====================================================================
// ⭐ FIXED: CHECK FOR PENDING ENROLLMENT (Direct Checkout - No Redirect)
// ====================================================================
async function checkPendingEnrollment() {
  const pending = localStorage.getItem('pendingEnrollment');
  
  if (!pending) {
    return; // No pending enrollment
  }

  try {
    const data = JSON.parse(pending);
    console.log('📌 Found pending enrollment:', data);
    
    // Validate data
    if (!data.courseId) {
      console.warn('⚠️ Invalid pending enrollment data');
      localStorage.removeItem('pendingEnrollment');
      return;
    }

    // Check if enrollment is not too old (24 hours)
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    if (data.timestamp && (Date.now() - data.timestamp > maxAge)) {
      console.log('⏰ Pending enrollment expired');
      localStorage.removeItem('pendingEnrollment');
      return;
    }

    // Clear localStorage immediately to prevent loops
    localStorage.removeItem('pendingEnrollment');
    
    // Show notification to user
    showEnrollmentNotification(data);
    
    // ⭐ Wait for checkout system to load
    console.log('⏳ Waiting for checkout system...');
    const checkoutReady = await waitForCheckout(10000); // 10 second timeout
    
    if (checkoutReady && typeof window.startPurchase === 'function') {
      // ⭐ Trigger checkout DIRECTLY (no redirect to all-courses page!)
      setTimeout(() => {
        console.log('💳 Triggering direct checkout for:', data.courseId);
        window.startPurchase(data.courseId);
      }, 1500); // Small delay to let dashboard load visually
    } else {
      console.error('❌ Checkout system not available');
      
      // Fallback: offer manual navigation
      const fallbackNotification = document.createElement('div');
      fallbackNotification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: #ef4444;
        color: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
        z-index: 10001;
        max-width: 350px;
      `;
      
      fallbackNotification.innerHTML = `
        <div style="display: flex; align-items: start; gap: 12px;">
          <ion-icon name="alert-circle" style="font-size: 24px; flex-shrink: 0;"></ion-icon>
          <div>
            <strong style="display: block; margin-bottom: 8px;">Checkout Unavailable</strong>
            <p style="font-size: 14px; margin: 0 0 12px 0; opacity: 0.95;">
              Unable to continue enrollment automatically.
            </p>
            <button onclick="window.location.href='/all-courses.html'" style="background: white; color: #ef4444; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 600;">
              Go to Courses
            </button>
          </div>
        </div>
      `;
      
      document.body.appendChild(fallbackNotification);
      
      setTimeout(() => {
        fallbackNotification.remove();
      }, 8000);
    }
    
  } catch (error) {
    console.error('❌ Error processing pending enrollment:', error);
    localStorage.removeItem('pendingEnrollment');
  }
}

// ====================================================================
// ⭐ NEW: Wait for checkout system to load
// ====================================================================
function waitForCheckout(maxWait = 10000) {
  return new Promise((resolve) => {
    // Already loaded
    if (typeof window.startPurchase === 'function') {
      console.log('✅ Checkout system ready');
      resolve(true);
      return;
    }
    
    console.log('⏳ Waiting for checkout system to load...');
    let waited = 0;
    const checkInterval = 100; // Check every 100ms
    
    const interval = setInterval(() => {
      if (typeof window.startPurchase === 'function') {
        clearInterval(interval);
        console.log('✅ Checkout system loaded after', waited, 'ms');
        resolve(true);
        return;
      }
      
      waited += checkInterval;
      
      if (waited >= maxWait) {
        clearInterval(interval);
        console.warn('⚠️ Checkout system timeout after', maxWait, 'ms');
        resolve(false);
      }
    }, checkInterval);
  });
}

// ====================================================================
// ⭐ Show Enrollment Notification
// ====================================================================
function showEnrollmentNotification(data) {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #14b8a6 0%, #0d9488 100%);
    color: white;
    padding: 20px 25px;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(20, 184, 166, 0.3);
    z-index: 10000;
    max-width: 350px;
    animation: slideIn 0.3s ease-out;
  `;
  
  notification.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <ion-icon name="information-circle" style="font-size: 24px;"></ion-icon>
      <div>
        <strong style="display: block; margin-bottom: 5px;">Continuing your enrollment...</strong>
        <span style="font-size: 14px; opacity: 0.95;">
          ${data.courseTitle || 'Selected Course'}
        </span>
      </div>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Add animation styles
  if (!document.getElementById('notification-styles')) {
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  // Remove after checkout triggers
  setTimeout(() => {
    notification.style.animation = 'slideIn 0.3s ease-out reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ====================================================================
// LOGOUT FUNCTIONALITY
// ====================================================================
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
      window.location.href = '/index.html';
    } catch (error) {
      console.error('Logout error:', error);
      alert('Error logging out. Please try again.');
    }
  });
}

// ====================================================================
// LOAD USER'S ENROLLED COURSES (ENHANCED FIX)
// ====================================================================
async function loadUserCourses() {
  if (isLoadingCourses) {
    console.log('⏳ Already loading courses, skipping...');
    return;
  }

  if (!currentUser) {
    console.warn('⚠️ Cannot load courses: User not authenticated yet');
    return;
  }

  isLoadingCourses = true;

  try {
    console.log('📚 Loading courses for:', currentUser.uid);
    
    const container = document.getElementById('courses-container');
    if (!container) {
      console.error('❌ courses-container not found');
      isLoadingCourses = false;
      return;
    }

    container.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading your courses...</p></div>';

    const userDocRef = doc(db, 'user', currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    
    if (!userDoc.exists()) {
      console.warn('⚠️ User document does not exist');
      showEmptyState();
      isLoadingCourses = false;
      return;
    }

    const userData = userDoc.data();
    let enrolledCoursesData = userData.enrolledCourses || [];

    console.log('📋 Raw enrolled courses data:', enrolledCoursesData);

    // ✅ FIX: Normalize and clean enrollment data
    const cleanedEnrollments = [];
    let needsUpdate = false;

    for (let i = 0; i < enrolledCoursesData.length; i++) {
      const enrollment = enrolledCoursesData[i];

      // Handle different data formats
      let normalizedEnrollment = null;

      // Case 1: String (just courseId)
      if (typeof enrollment === 'string') {
        console.log(`🔧 Converting string enrollment: ${enrollment}`);
        normalizedEnrollment = {
          courseId: enrollment,
          progress: 0,
          completedLessons: [],
          lastAccessedLesson: 0,
          isCompleted: false
        };
        needsUpdate = true;
      }
      // Case 2: Object with courseId
      else if (enrollment && typeof enrollment === 'object' && enrollment.courseId) {
        normalizedEnrollment = {
          courseId: enrollment.courseId,
          progress: enrollment.progress || 0,
          completedLessons: enrollment.completedLessons || [],
          lastAccessedLesson: enrollment.lastAccessedLesson || 0,
          isCompleted: enrollment.isCompleted || false
        };
        
        // Only add optional fields if they exist
        if (enrollment.lastAccessedAt) {
          normalizedEnrollment.lastAccessedAt = enrollment.lastAccessedAt;
        }
        if (enrollment.enrolledAt) {
          normalizedEnrollment.enrolledAt = enrollment.enrolledAt;
        }
        if (enrollment.completedAt) {
          normalizedEnrollment.completedAt = enrollment.completedAt;
        }
      }
      // Case 3: Invalid data
      else {
        console.warn(`⚠️ Skipping invalid enrollment at index ${i}:`, enrollment);
        needsUpdate = true;
        continue;
      }

      // Validate courseId is a non-empty string
      if (normalizedEnrollment && 
          normalizedEnrollment.courseId && 
          typeof normalizedEnrollment.courseId === 'string' &&
          normalizedEnrollment.courseId.trim().length > 0) {
        cleanedEnrollments.push(normalizedEnrollment);
      } else {
        console.warn(`⚠️ Invalid courseId in enrollment:`, normalizedEnrollment);
        needsUpdate = true;
      }
    }

    // Update Firestore if data was cleaned
    if (needsUpdate && cleanedEnrollments.length > 0) {
      console.log('🔄 Updating cleaned enrollment data in Firestore...');
      try {
        await updateDoc(userDocRef, {
          enrolledCourses: cleanedEnrollments
        });
        console.log('✅ Enrollment data cleaned successfully');
      } catch (updateError) {
        console.error('❌ Error updating cleaned data:', updateError);
      }
    }

    if (cleanedEnrollments.length === 0) {
      console.log('📭 No valid enrollments found');
      showEmptyState();
      isLoadingCourses = false;
      return;
    }

    // Load course details
    enrolledCourses = [];
    let completedCount = 0;
    let inProgressCount = 0;

    console.log(`🔍 Loading ${cleanedEnrollments.length} course(s)...`);

    for (const enrollment of cleanedEnrollments) {
      try {
        console.log(`📖 Fetching course: ${enrollment.courseId}`);
        
        const courseDoc = await getDoc(doc(db, 'courses', enrollment.courseId));
        
        if (courseDoc.exists()) {
          const courseData = courseDoc.data();
          
          enrolledCourses.push({
            courseId: enrollment.courseId,
            course: courseData,
            progress: enrollment.progress || 0,
            completedLessons: enrollment.completedLessons || [],
            lastAccessedLesson: enrollment.lastAccessedLesson || 0,
            lastAccessedAt: enrollment.lastAccessedAt,
            isCompleted: enrollment.isCompleted || false,
            completedAt: enrollment.completedAt,
            enrolledAt: enrollment.enrolledAt
          });

          if (enrollment.isCompleted) {
            completedCount++;
          } else if (enrollment.progress > 0) {
            inProgressCount++;
          }

          console.log(`✅ Loaded: ${courseData.title}`);
        } else {
          console.warn(`⚠️ Course not found: ${enrollment.courseId}`);
        }
      } catch (error) {
        console.error(`❌ Error loading course ${enrollment.courseId}:`, error);
      }
    }

    // Update stats
    const totalCoursesEl = document.getElementById('total-courses');
    const completedCoursesEl = document.getElementById('completed-courses');
    const inProgressCoursesEl = document.getElementById('in-progress-courses');

    if (totalCoursesEl) totalCoursesEl.textContent = enrolledCourses.length;
    if (completedCoursesEl) completedCoursesEl.textContent = completedCount;
    if (inProgressCoursesEl) inProgressCoursesEl.textContent = inProgressCount;

    // Display courses
    if (enrolledCourses.length > 0) {
      displayCourses();
      console.log(`🎉 Successfully loaded ${enrolledCourses.length} course(s)`);
    } else {
      showEmptyState();
    }

  } catch (error) {
    console.error('❌ Error loading courses:', error);
    showError('Error loading your courses. Please refresh the page.');
  } finally {
    isLoadingCourses = false;
  }
}

// ====================================================================
// DISPLAY COURSES ON PAGE
// ====================================================================
function displayCourses() {
  const container = document.getElementById('courses-container');
  
  if (!container) {
    console.error('courses-container element not found');
    return;
  }

  if (enrolledCourses.length === 0) {
    showEmptyState();
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'courses-grid';

  enrolledCourses.forEach(enrollment => {
    const card = createCourseCard(enrollment);
    grid.appendChild(card);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

// ====================================================================
// CREATE COURSE CARD
// ====================================================================
function createCourseCard(enrollment) {
  const card = document.createElement('div');
  card.className = 'course-card';
  
  const course = enrollment.course;
  const progress = enrollment.progress || 0;
  const isCompleted = enrollment.isCompleted;
  const totalLessons = course.totalLessons || course.lessons?.length || 0;
  const completedLessons = enrollment.completedLessons?.length || 0;
  
  let lastAccessedText = 'Not started';
  if (enrollment.lastAccessedAt) {
    const lastDate = enrollment.lastAccessedAt.toDate ? enrollment.lastAccessedAt.toDate() : new Date(enrollment.lastAccessedAt);
    const now = new Date();
    const diffMinutes = Math.floor((now - lastDate) / 60000);
    
    if (diffMinutes < 1) {
      lastAccessedText = 'Just now';
    } else if (diffMinutes < 60) {
      lastAccessedText = `${diffMinutes} min ago`;
    } else if (diffMinutes < 1440) {
      lastAccessedText = `${Math.floor(diffMinutes / 60)} hours ago`;
    } else {
      lastAccessedText = `${Math.floor(diffMinutes / 1440)} days ago`;
    }
  }

  card.innerHTML = `
    <div style="position: relative;">
      <img src="${course.thumbnail || 'https://via.placeholder.com/400x225?text=Course+Image'}" 
           alt="${course.title}" 
           class="course-thumbnail"
           onerror="this.src='https://via.placeholder.com/400x225?text=Course+Image'">
      ${isCompleted ? '<div class="completion-badge"><ion-icon name="checkmark-circle"></ion-icon> Completed</div>' : ''}
    </div>
    <div class="course-content">
      <h3 class="course-title">${course.title}</h3>
      <div class="course-meta">
        <span><ion-icon name="folder-outline"></ion-icon> ${course.category || 'General'}</span>
        <span><ion-icon name="book-outline"></ion-icon> ${completedLessons}/${totalLessons} Lessons</span>
      </div>
      <div class="progress-container">
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${progress}%"></div>
        </div>
        <div class="progress-text">
          <span>${progress}% Complete</span>
          <span>${lastAccessedText}</span>
        </div>
      </div>
      <div class="course-actions">
        <button class="btn btn-primary" onclick="continueCourse('${enrollment.courseId}')">
          <ion-icon name="${progress > 0 ? 'play' : 'play-circle'}-outline"></ion-icon>
          ${progress > 0 ? 'Continue Learning' : 'Start Course'}
        </button>
        ${isCompleted ? `
          <button class="btn btn-success" onclick="viewCertificate('${enrollment.courseId}')">
            <ion-icon name="ribbon-outline"></ion-icon>
            Certificate
          </button>
        ` : ''}
      </div>
    </div>
  `;

  return card;
}

// ====================================================================
// CONTINUE COURSE
// ====================================================================
window.continueCourse = function(courseId) {
  console.log('🚀 Redirecting to course viewer:', courseId);
  window.location.href = `./course-viewer.html?courseId=${courseId}`;
};

// ====================================================================
// VIEW CERTIFICATE
// ====================================================================
window.viewCertificate = async function(courseId) {
  const enrollment = enrolledCourses.find(e => e.courseId === courseId);
  
  if (!enrollment || !enrollment.isCompleted) {
    alert('Course not completed yet');
    return;
  }

  await generateCertificate(enrollment);
  const certModal = document.getElementById('certificate-modal');
  if (certModal) {
    certModal.classList.add('open');
  }
};

// ====================================================================
// GENERATE CERTIFICATE
// ====================================================================
async function generateCertificate(enrollment) {
  try {
    const userDoc = await getDoc(doc(db, 'user', currentUser.uid));
    const userData = userDoc.data();
    
    const studentName = `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || 
                       currentUser.displayName || 
                       currentUser.email.split('@')[0];
    
    const courseName = enrollment.course.title;
    
    const completionDate = enrollment.completedAt?.toDate().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }) || new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const canvas = document.getElementById('certificate-canvas');
    if (!canvas) {
      console.error('Certificate canvas not found');
      return;
    }

    const ctx = canvas.getContext('2d');
    canvas.width = 800;
    canvas.height = 600;

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 800, 600);

    // Outer Border
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 12;
    ctx.strokeRect(15, 15, 770, 570);

    // Inner Border
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 3;
    ctx.strokeRect(35, 35, 730, 530);

    // Corner Accents
    ctx.fillStyle = '#14b8a6';
    ctx.fillRect(25, 25, 60, 8);
    ctx.fillRect(25, 25, 8, 60);
    ctx.fillRect(715, 25, 60, 8);
    ctx.fillRect(767, 25, 8, 60);
    ctx.fillRect(25, 567, 60, 8);
    ctx.fillRect(25, 515, 8, 60);
    ctx.fillRect(715, 567, 60, 8);
    ctx.fillRect(767, 515, 8, 60);

    // Title
    ctx.fillStyle = '#0a0a0a';
    ctx.font = 'bold 52px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('CERTIFICATE', 400, 110);

    // Subtitle
    ctx.font = '28px Arial, sans-serif';
    ctx.fillStyle = '#14b8a6';
    ctx.fillText('OF COMPLETION', 400, 150);

    // Line
    ctx.strokeStyle = '#14b8a6';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(250, 170);
    ctx.lineTo(550, 170);
    ctx.stroke();

    // Text
    ctx.font = 'italic 22px Arial, sans-serif';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('This certifies that', 400, 230);

    ctx.font = 'bold 40px Arial, sans-serif';
    ctx.fillStyle = '#14b8a6';
    ctx.fillText(studentName, 400, 280);

    ctx.font = 'italic 22px Arial, sans-serif';
    ctx.fillStyle = '#4b5563';
    ctx.fillText('has successfully completed', 400, 330);

    ctx.font = 'bold 32px Arial, sans-serif';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(courseName, 400, 385);

    ctx.font = '20px Arial, sans-serif';
    ctx.fillStyle = '#4b5563';
    ctx.fillText(`Completed on ${completionDate}`, 400, 440);

    // Signatures
    const sigY = 520;
    ctx.strokeStyle = '#0a0a0a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, sigY);
    ctx.lineTo(320, sigY);
    ctx.stroke();
    
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText('Tech Wizards Academy', 235, sigY + 25);
    
    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Platform Director', 235, sigY + 45);

    ctx.beginPath();
    ctx.moveTo(480, sigY);
    ctx.lineTo(650, sigY);
    ctx.stroke();
    
    ctx.font = 'bold 18px Arial, sans-serif';
    ctx.fillStyle = '#0a0a0a';
    ctx.fillText(enrollment.course.instructor || 'Course Instructor', 565, sigY + 25);
    
    ctx.font = '15px Arial, sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('Lead Instructor', 565, sigY + 45);

    console.log('✅ Certificate generated');

  } catch (error) {
    console.error('❌ Error generating certificate:', error);
    alert('Error generating certificate. Please try again.');
  }
}

// ====================================================================
// CERTIFICATE CONTROLS
// ====================================================================
const downloadBtn = document.getElementById('download-certificate');
if (downloadBtn) {
  downloadBtn.addEventListener('click', () => {
    const canvas = document.getElementById('certificate-canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `certificate-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });
}

const closeBtn = document.getElementById('close-certificate');
if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    const modal = document.getElementById('certificate-modal');
    if (modal) modal.classList.remove('open');
  });
}

const certModal = document.getElementById('certificate-modal');
if (certModal) {
  certModal.addEventListener('click', (e) => {
    if (e.target.id === 'certificate-modal') {
      certModal.classList.remove('open');
    }
  });
}

// ====================================================================
// SHOW EMPTY STATE
// ====================================================================
function showEmptyState() {
  const container = document.getElementById('courses-container');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <ion-icon name="school-outline" style="font-size: 4rem; color: var(--primary-teal); margin-bottom: 1rem;"></ion-icon>
      <h3>No courses yet</h3>
      <p>Start your learning journey by browsing our course catalog</p>
      <a href="/all-courses.html" class="btn btn-primary">
        <ion-icon name="compass-outline"></ion-icon>
        Browse Courses
      </a>
    </div>
  `;
  
  const totalEl = document.getElementById('total-courses');
  const completedEl = document.getElementById('completed-courses');
  const progressEl = document.getElementById('in-progress-courses');

  if (totalEl) totalEl.textContent = '0';
  if (completedEl) completedEl.textContent = '0';
  if (progressEl) progressEl.textContent = '0';
}

// ====================================================================
// SHOW ERROR
// ====================================================================
function showError(message) {
  const container = document.getElementById('courses-container');
  if (!container) return;

  container.innerHTML = `
    <div class="empty-state">
      <ion-icon name="alert-circle-outline" style="font-size: 4rem; color: #ef4444; margin-bottom: 1rem;"></ion-icon>
      <h3 style="color: #ef4444;">Error</h3>
      <p>${message}</p>
      <button class="btn btn-primary" onclick="location.reload()">
        <ion-icon name="refresh-outline"></ion-icon>
        Retry
      </button>
    </div>
  `;
}

// ====================================================================
// PAGE VISIBILITY HANDLER
// ====================================================================
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentUser && !isLoadingCourses) {
    console.log('🔄 Tab active - refreshing data');
    loadUserCourses();
  }
});

console.log('✅ Student Dashboard initialized - v4 (Direct Checkout - No Extra Redirects)');