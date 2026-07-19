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

const app = () => {
    navSlide();
    mobileDropdown();
    heroFade();
}

app();
