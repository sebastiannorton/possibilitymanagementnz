const navSlide = () => {
    const burger = document.querySelector('.burger');
    const nav = document.querySelector('.nav-links');
    const navLinks = document.querySelectorAll('.nav-links li');
    
    burger.addEventListener('click', () => {
        // Toggle Nav
        nav.classList.toggle('nav-active');
        
        // Animate Links
        navLinks.forEach((link, index) => {
            if (link.style.animation) {
                link.style.animation = '';
            } else {
                link.style.animation = `navLinkFade 0.5s ease forwards ${index / 7 + 0.3}s`;
            }
        });
        
        // Burger Animation
        burger.classList.toggle('toggle');
    });
}

// Mobile Dropdown Toggle
const mobileDropdown = () => {
    const dropdownToggles = document.querySelectorAll('.nav-item.has-dropdown');
    
    dropdownToggles.forEach(toggle => {
        toggle.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                toggle.classList.toggle('active');
            }
        });
    });
}

const heroFade = () => {
    const hero = document.querySelector('.hero-image-full');
    if (!hero) return;

    const FADE_START = 200; // px scrolled past top of image before fade begins
    const FADE_END = 600;   // px scrolled past top of image when fully faded

    const updateFade = () => {
        const rect = hero.getBoundingClientRect();
        const scrolledPast = -rect.top; // how many px the image top has scrolled up

        if (scrolledPast <= FADE_START) {
            hero.style.setProperty('--fade-opacity', '0');
        } else if (scrolledPast >= FADE_END) {
            hero.style.setProperty('--fade-opacity', '1');
        } else {
            const progress = (scrolledPast - FADE_START) / (FADE_END - FADE_START);
            hero.style.setProperty('--fade-opacity', String(progress));
        }
    };

    window.addEventListener('scroll', updateFade, { passive: true });
    updateFade();
};

const scrollAnimations = () => {
    // Select elements to animate site-wide
    const selectors = [
        '.card',
        '.event-card',
        '.possibilitator-card',
        '.collaboration-card',
        '.content-row',
        '.gallery-item',
        '.newsletter',
        '.section-title h2',
        '.video-wrapper'
    ];

    const elementsToAnimate = document.querySelectorAll(selectors.join(', '));

    // Create intersection observer
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                // Once animated, we don't need to observe it anymore
                observer.unobserve(entry.target);
            }
        });
    }, {
        threshold: 0.1, // trigger when 10% of the element is visible
        rootMargin: '0px 0px -50px 0px' // offset slightly so it triggers just before entering
    });

    // Setup and observe each element
    elementsToAnimate.forEach((el, index) => {
        el.classList.add('animate-on-scroll');
        
        // Add staggered delay for grid items / siblings
        const parent = el.parentElement;
        if (parent && (parent.classList.contains('grid') || 
                       parent.classList.contains('gallery-grid') || 
                       parent.classList.contains('telegram-groups-grid') ||
                       parent.classList.contains('collaboration-grid') ||
                       parent.classList.contains('events-stack') ||
                       parent.classList.contains('possibilitators-grid'))) {
            // Stagger siblings up to 4 items
            const siblingIndex = Array.from(parent.children).indexOf(el);
            if (siblingIndex > 0) {
                const delayClass = `delay-${Math.min(siblingIndex, 4)}`;
                el.classList.add(delayClass);
            }
        }
        
        observer.observe(el);
    });
};

const app = () => {
    navSlide();
    mobileDropdown();
    heroFade();
    scrollAnimations();
}

app();
