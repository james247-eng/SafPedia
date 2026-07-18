// ====================================================================
// COURSES.JS - Multi-Lesson Course Listing with LocalStorage Support
// Tech Wizards Academy
// ====================================================================

import { auth, db } from '../firebase-config.js';
import { collection, getDocs, query, where, doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.9.1/firebase-firestore.js';

// ====================================================================
// COURSE ID TO PAGE URL MAPPING
// Add your course pages here as you create them
// ====================================================================
const COURSE_PAGES = {
  '05lofHnsmXsWz0taK0zy': '/web-development-course.html',
  // Add more courses here:
  // 'PYTHON_COURSE_ID': '/python-course.html',
  // 'DIGITAL_MARKETING_ID': '/digital-marketing-course.html',
};

// ====================================================================
// LOAD ALL COURSES
// ====================================================================
async function loadCourses() {
  try {
    const courseInnerWrapper = document.querySelector('.course-inner-wrapper');
    
    if (!courseInnerWrapper) {
      console.error('Course container not found');
      return;
    }

    courseInnerWrapper.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Loading courses...</p>';

    const q = query(
      collection(db, 'courses'),
      where('isPublished', '==', true)
    );

    const querySnapshot = await getDocs(q);
    courseInnerWrapper.innerHTML = '';

    if (querySnapshot.empty) {
      courseInnerWrapper.innerHTML = `
        <div style="text-align:center; padding:60px 20px; grid-column: 1/-1;">
          <h3 style="color:#666; margin-bottom:10px;">No courses available yet</h3>
          <p style="color:#999;">Check back soon for new courses!</p>
        </div>
      `;
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const course = docSnap.data();
      const courseCard = createCourseCard(docSnap.id, course);
      courseInnerWrapper.appendChild(courseCard);
    });

    console.log(`✅ Loaded ${querySnapshot.size} course(s)`);

  } catch (error) {
    console.error('Error loading courses:', error);
    const courseInnerWrapper = document.querySelector('.course-inner-wrapper');
    if (courseInnerWrapper) {
      courseInnerWrapper.innerHTML = `
        <div style="text-align:center; padding:40px; color:#ef4444; grid-column: 1/-1;">
          <p>Error loading courses. Please try again later.</p>
          <p style="font-size:12px; color:#999;">${error.message}</p>
        </div>
      `;
    }
  }
}

// ====================================================================
// CREATE COURSE CARD
// ====================================================================
function createCourseCard(courseId, course) {
  const card = document.createElement('div');
  card.className = 'c-card';
  card.dataset.courseId = courseId;

  const rating = course.rating || 4.5;
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating % 1 >= 0.5;
  let starsHTML = '';
  
  for (let i = 0; i < fullStars; i++) {
    starsHTML += '<ion-icon name="star" style="color:gold;"></ion-icon>';
  }
  if (hasHalfStar) {
    starsHTML += '<ion-icon name="star-half" style="color:gold;"></ion-icon>';
  }
  for (let i = Math.ceil(rating); i < 5; i++) {
    starsHTML += '<ion-icon name="star-outline" style="color:gold;"></ion-icon>';
  }

  const shortDesc = course.shortDescription || course.description || 'No description available';
  const truncatedDesc = shortDesc.length > 100 
    ? shortDesc.substring(0, 100) + '...' 
    : shortDesc;

  const totalLessons = course.totalLessons || course.lessons?.length || 0;

  card.innerHTML = `
    <img src="${course.thumbnail || 'https://via.placeholder.com/300x200?text=Course+Image'}" 
         alt="${course.title}" 
         onerror="this.src='https://via.placeholder.com/300x200?text=No+Image'">
    
    <h3 class="title">${course.title}</h3>
    
    <div class="active-learners">
      <ion-icon name="people-outline"></ion-icon> ${course.enrolledCount || 0} students • 
      <ion-icon name="book-outline"></ion-icon> ${totalLessons} lessons
    </div>
    
    <div class="price">
      ₦${(course.price || 0).toLocaleString()}
    </div>
    
    <p class="description">${truncatedDesc}</p>
    
    <div class="rating-container">
      ${starsHTML}
      <span style="color:#666; margin-left:5px;">(${rating})</span>
    </div>
    
    <div class="button-container">
      <a href="#" class="view-details-btn" data-course-id="${courseId}" data-course-title="${course.title}">
        View Details
      </a>
      <a href="#" class="buy-now-btn" data-course-id="${courseId}" data-course-title="${course.title}">
       <ion-icon name="school-outline" style="font-size: 18px;"></ion-icon> Enroll Now
      </a>
    </div>
  `;

  return card;
}

// ====================================================================
// GET SINGLE COURSE DETAILS
// ====================================================================
async function getCourseDetails(courseId) {
  try {
    const courseDoc = await getDoc(doc(db, 'courses', courseId));
    
    if (courseDoc.exists()) {
      return { id: courseDoc.id, ...courseDoc.data() };
    }
    return null;
  } catch (error) {
    console.error('Error getting course details:', error);
    return null;
  }
}

// ====================================================================
// CHECK IF USER IS ENROLLED
// ====================================================================
async function checkEnrollment(userId, courseId) {
  try {
    const userDoc = await getDoc(doc(db, 'user', userId));
    if (userDoc.exists()) {
      const userData = userDoc.data();
      const enrolledCourses = userData.enrolledCourses || [];
      
      // Handle both string and object formats
      return enrolledCourses.some(enrollment => {
        if (typeof enrollment === 'string') {
          return enrollment === courseId;
        }
        return enrollment.courseId === courseId;
      });
    }
    return false;
  } catch (error) {
    console.error('Error checking enrollment:', error);
    return false;
  }
}

// ====================================================================
// SAVE PENDING ENROLLMENT TO LOCALSTORAGE
// ====================================================================
function savePendingEnrollment(courseId, courseTitle) {
  const enrollmentData = {
    courseId: courseId,
    courseTitle: courseTitle || 'Selected Course',
    timestamp: Date.now(),
    returnUrl: window.location.href
  };

  localStorage.setItem('pendingEnrollment', JSON.stringify(enrollmentData));
  console.log('💾 Saved pending enrollment:', enrollmentData);
}

// ====================================================================
// EVENT LISTENERS
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
  loadCourses();

  // Filter courses
  const filterButtons = document.querySelectorAll('[data-filter-category]');
  filterButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const category = e.target.dataset.filterCategory;
      filterCourses(category);
    });
  });

  // Search courses
  const searchInput = document.querySelector('#course-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.trim();
      if (searchTerm.length >= 3) {
        searchCourses(searchTerm);
      } else if (searchTerm.length === 0) {
        loadCourses();
      }
    });
  }

  // ⭐ Handle "View Details" clicks - REDIRECT TO COURSE PAGE
  document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('view-details-btn')) {
      e.preventDefault();
      const courseId = e.target.dataset.courseId;
      const courseTitle = e.target.dataset.courseTitle || 'Course';
      
      console.log('📖 Viewing course details:', courseId);
      
      // Check if user is logged in and enrolled
      const user = auth.currentUser;
      if (user) {
        const isEnrolled = await checkEnrollment(user.uid, courseId);
        if (isEnrolled) {
          console.log('✅ User enrolled, redirecting to course viewer');
          window.location.href = `/course-viewer.html?courseId=${courseId}`;
          return;
        }
      }
      
      // ⭐ Redirect to course page (static or fallback)
      const coursePageUrl = COURSE_PAGES[courseId];
      
      if (coursePageUrl) {
        // Redirect to specific course page
        console.log('🔀 Redirecting to course page:', coursePageUrl);
        window.location.href = coursePageUrl;
      } else {
        // Fallback: Show alert to create page
        console.warn('⚠️ No page defined for course:', courseId);
        alert(`Course page not created yet.\n\nTo fix this:\n1. Create a page for this course (e.g., /python-course.html)\n2. Add mapping in courses.js:\n   '${courseId}': '/your-course-page.html'`);
        
        // Optional: Still redirect to first available course page as example
        const firstPageUrl = Object.values(COURSE_PAGES)[0];
        if (firstPageUrl) {
          console.log('Redirecting to example course page:', firstPageUrl);
          window.location.href = firstPageUrl;
        }
      }
    }
  });

  // ⭐ Handle "Enroll Now" clicks - SAVE TO LOCALSTORAGE
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('buy-now-btn') || e.target.closest('.buy-now-btn')) {
      e.preventDefault();
      
      const btn = e.target.classList.contains('buy-now-btn') 
        ? e.target 
        : e.target.closest('.buy-now-btn');
      
      const courseId = btn.dataset.courseId;
      const courseTitle = btn.dataset.courseTitle || 'Course';
      
      console.log('💳 Enroll Now clicked for:', courseId);
      
      // Check if user is logged in
      const user = auth.currentUser;
      
      if (!user) {
        // ⭐ Save to localStorage and redirect to login
        console.log('⚠️ User not logged in, saving enrollment...');
        savePendingEnrollment(courseId, courseTitle);
        window.location.href = '/sign-in.html';
        return;
      }
      
      // User is logged in, proceed with checkout
      if (typeof window.startPurchase === 'function') {
        window.startPurchase(courseId);
      } else {
        console.error('❌ startPurchase function not found');
        alert('Checkout system not available. Please refresh the page.');
      }
    }
  });

  // ⭐ Handle autoBuy parameter (from dashboard redirect)
  handleAutoBuy();
});

// ====================================================================
// HANDLE AUTO-BUY FROM DASHBOARD
// ====================================================================
function handleAutoBuy() {
  const urlParams = new URLSearchParams(window.location.search);
  const autoBuy = urlParams.get('autoBuy');
  
  if (autoBuy) {
    console.log('🚀 Auto-buy detected for course:', autoBuy);
    
    // Small delay to ensure page is loaded
    setTimeout(() => {
      if (typeof window.startPurchase === 'function') {
        console.log('💳 Triggering auto-purchase...');
        window.startPurchase(autoBuy);
      } else {
        console.error('❌ startPurchase function not found');
        alert('Checkout system not available. Please try again.');
      }
    }, 500);
  }
}

// ====================================================================
// INITIATE CHECKOUT (Legacy support)
// ====================================================================
window.initiateCheckout = function(courseId, price) {
  console.log('Initiating checkout for course:', courseId);
  
  // Check if user is logged in
  const user = auth.currentUser;
  
  if (!user) {
    // Save to localStorage and redirect to login
    savePendingEnrollment(courseId, 'Course');
    window.location.href = '/sign-in.html';
    return;
  }
  
  // User logged in, proceed with checkout
  if (typeof window.startPurchase === 'function') {
    window.startPurchase(courseId);
  } else {
    console.error('startPurchase function not found. Make sure checkout.js is loaded.');
    alert('Checkout system not available. Please contact support.');
  }
};

// ====================================================================
// FILTER COURSES BY CATEGORY
// ====================================================================
async function filterCourses(category) {
  try {
    const courseInnerWrapper = document.querySelector('.course-inner-wrapper');
    courseInnerWrapper.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Loading courses...</p>';

    let q;
    if (category === 'all' || !category) {
      q = query(collection(db, 'courses'), where('isPublished', '==', true));
    } else {
      q = query(collection(db, 'courses'), where('isPublished', '==', true), where('category', '==', category));
    }

    const querySnapshot = await getDocs(q);
    courseInnerWrapper.innerHTML = '';

    if (querySnapshot.empty) {
      courseInnerWrapper.innerHTML = `
        <div style="text-align:center; padding:60px 20px; grid-column: 1/-1;">
          <h3 style="color:#666;">No courses found in this category</h3>
        </div>
      `;
      return;
    }

    querySnapshot.forEach((docSnap) => {
      const course = docSnap.data();
      const courseCard = createCourseCard(docSnap.id, course);
      courseInnerWrapper.appendChild(courseCard);
    });

    console.log(`✅ Filtered to ${querySnapshot.size} course(s)`);

  } catch (error) {
    console.error('Error filtering courses:', error);
  }
}

// ====================================================================
// SEARCH COURSES
// ====================================================================
async function searchCourses(searchTerm) {
  try {
    const courseInnerWrapper = document.querySelector('.course-inner-wrapper');
    courseInnerWrapper.innerHTML = '<p style="text-align:center; padding:40px; color:#666;">Searching...</p>';

    const q = query(collection(db, 'courses'), where('isPublished', '==', true));
    const querySnapshot = await getDocs(q);
    courseInnerWrapper.innerHTML = '';

    const searchLower = searchTerm.toLowerCase();
    let foundCourses = 0;

    querySnapshot.forEach((docSnap) => {
      const course = docSnap.data();
      const titleMatch = course.title?.toLowerCase().includes(searchLower);
      const descMatch = course.description?.toLowerCase().includes(searchLower);
      const categoryMatch = course.category?.toLowerCase().includes(searchLower);
      const instructorMatch = course.instructor?.toLowerCase().includes(searchLower);

      if (titleMatch || descMatch || categoryMatch || instructorMatch) {
        const courseCard = createCourseCard(docSnap.id, course);
        courseInnerWrapper.appendChild(courseCard);
        foundCourses++;
      }
    });

    if (foundCourses === 0) {
      courseInnerWrapper.innerHTML = `
        <div style="text-align:center; padding:60px 20px; grid-column: 1/-1;">
          <h3 style="color:#666;">No courses found for "${searchTerm}"</h3>
          <p style="color:#999;">Try a different search term</p>
        </div>
      `;
    }

    console.log(`🔍 Found ${foundCourses} course(s) matching "${searchTerm}"`);

  } catch (error) {
    console.error('Error searching courses:', error);
  }
}

export { loadCourses, filterCourses, searchCourses, getCourseDetails };

console.log('✅ Courses.js loaded with LocalStorage support');