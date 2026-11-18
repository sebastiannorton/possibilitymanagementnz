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

    const updateFade = () => {
        const rect = hero.getBoundingClientRect();
        const scrolledPast = -rect.top; // how many px the image top has scrolled up
        // Finish the fade exactly as the picture's bottom edge reaches the top
        // of the viewport, regardless of the hero's rendered height.
        const fadeEnd = Math.max(FADE_START + 100, hero.offsetHeight);

        if (scrolledPast <= FADE_START) {
            hero.style.setProperty('--fade-opacity', '0');
        } else if (scrolledPast >= fadeEnd) {
            hero.style.setProperty('--fade-opacity', '1');
        } else {
            const progress = (scrolledPast - FADE_START) / (fadeEnd - FADE_START);
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

// Expand the Box 2027 promo banner
// -------------------------------
// A marquee ribbon linking to /expand-the-box/. Injected right after
// the sticky <header> on every page except /expand-the-box/ itself. It sits
// in normal document flow, so it simply scrolls off the screen with the
// page — disappearing at about the point the homepage hero leaves the
// viewport. Markup + styles live in css/styles.css (.etb-banner).
//
// One single text stream: the first copy starts centred on page load, pans
// constantly left, and the next copy enters at the right edge at the exact
// moment the first letter leaves through the left edge — no blank period,
// seamless forever. Doubling the text with a spacer (rather than jumping a
// single copy) is what makes the handover seamless: the two copies are
// always exactly one banner-width apart, so when the lead letter is at the
// left edge the trailing copy's first letter is precisely at the right edge.
// The spacer that maintains that spacing depends on the rendered banner and
// text width, so it is set in JS and refreshed on resize.
const etbBanner = () => {
    if (window.location.pathname.indexOf('/expand-the-box') === 0) return;

    const header = document.querySelector('header');
    if (!header) return;

    const MESSAGE = 'Expand the Box 2027! Click here for more information and registration.';

    const banner = document.createElement('a');
    banner.className = 'etb-banner';
    banner.href = '/expand-the-box/';
    banner.setAttribute('aria-label', MESSAGE);
    banner.innerHTML =
        '<span class="etb-banner-track">' +
        `<span class="etb-banner-text">${MESSAGE}</span>` +
        '<span class="etb-banner-gap" aria-hidden="true"></span>' +
        `<span class="etb-banner-text" aria-hidden="true">${MESSAGE}</span>` +
        '</span>';

    header.parentNode.insertBefore(banner, header.nextSibling);

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const track = banner.firstElementChild;
    const copy = track.firstElementChild;
    const gap = copy.nextElementSibling;

    // Size the spacer so the copies sit exactly one banner-width apart,
    // measured from the first letter of copy one to the first letter of
    // copy two. Re-measure on resize (fonts/layout can reflow the widths).
    const resizeSpacers = () => {
        gap.style.width = `${Math.max(0, banner.offsetWidth - copy.offsetWidth)}px`;
    };
    resizeSpacers();
    window.addEventListener('resize', resizeSpacers);

    const speed = 90; // px per second, a slow readable roll
    let lastTime = performance.now();
    let x = (banner.offsetWidth - copy.offsetWidth) / 2; // centred on load

    const pan = (now) => {
        let delta = now - lastTime;
        lastTime = now;
        // The tab can suspend rAF (hidden tab, breakpoint in the debugger);
        // cap the step so returning to the tab doesn't teleport the text.
        if (delta > 250) delta = 0;

        x -= speed * delta / 1000;
        // First letter fully past the left edge → advance by exactly one
        // banner width. The trailing copy was spaced so its first letter is
        // then precisely at the right edge; the cycle repeats seamlessly.
        if (x <= -copy.offsetWidth) {
            x += copy.offsetWidth + gap.offsetWidth;
        }
        track.style.transform = `translateX(${Math.round(x * 100) / 100}px)`;
        requestAnimationFrame(pan);
    };
    requestAnimationFrame(pan);
};

const app = () => {
    navSlide();
    mobileDropdown();
    heroFade();
    scrollAnimations();
    etbBanner();
}

app();
