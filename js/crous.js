document.addEventListener("DOMContentLoaded", function() {

  const input = document.getElementById("amount");
  const results = document.getElementById("results");
  const crousText = document.getElementById("crous").querySelector("b");
  const crousBourse = document.getElementById("crous-bourse").querySelector("b");
  const pizzaText = document.getElementById("pizza").querySelector("b");
  const robux = document.getElementById("robux").querySelector("b");
  const gems = document.getElementById("gems").querySelector("b");
  const tastycrousty = document.getElementById("tastycrousty").querySelector("b");
  const jnr28k = document.getElementById("jnr28k").querySelector("b");
  const hexacon = document.getElementById("hexacon").querySelector("b");
  const kebab = document.getElementById("kebab").querySelector("b");
  const vbucks = document.getElementById("vbucks").querySelector("b");
  const vody = document.getElementById("vody").querySelector("b");
  const retraite = document.getElementById("retraite").querySelector("b");

  const CROUS_PRICE = 3.3;
  const PIZZA_PRICE = 4.79;
  const CROUS_BOURSE_PRICE = 1;
  const ROBUX_PRICE = 0.01;
  const CLASH_ROYALE_GEM = 0.0125;
  const CROUSTY = 9;
  const JNR_28_K = 14;
  const HEXACON = 660;
  const KEBAB_PRICE = 5;
  const VBUCKS_PRICE = 8.99 / 1000;
  const RETRAITE_ANNUAL_COST_EUR = 407e9; 
  const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; 
  const VODY_22_25CL = 4.25; 
  const RETRAITE_EUR_PER_SECOND = RETRAITE_ANNUAL_COST_EUR / SECONDS_PER_YEAR;


  function formatDuration(seconds) {
    if (!isFinite(seconds) || seconds <= 0) return "0 ms";

    if (seconds < 0.001) return `${(seconds * 1e6).toFixed(2)} µs`;
    if (seconds < 1) return `${(seconds * 1000).toFixed(2)} ms`;

    let s = Math.floor(seconds);

    const yearSec = SECONDS_PER_YEAR;
    const daySec = 24 * 60 * 60;
    const hourSec = 60 * 60;
    const minSec = 60;

    const years = Math.floor(s / yearSec); s -= years * yearSec;
    const days = Math.floor(s / daySec); s -= days * daySec;
    const hours = Math.floor(s / hourSec); s -= hours * hourSec;
    const mins = Math.floor(s / minSec); s -= mins * minSec;

    const parts = [];
    if (years) parts.push(`${years} an${years > 1 ? "s" : ""}`);
    if (days || years) parts.push(`${days} j`);
    if (hours || days || years) parts.push(`${hours} h`);
    parts.push(`${mins} min`);
    parts.push(`${s} s`);

    return parts.join(" ");
  }

  function initializeLogos() {
    const screens = document.querySelectorAll('.result-panel')
    
    screens.forEach(screen => {
      const logos = screen.querySelectorAll('.logo')
      
      logos.forEach(logo => {
        const rect = screen.getBoundingClientRect()
        
        const maxTop = rect.height - logo.offsetHeight
        const maxLeft = rect.width - logo.offsetWidth
        
        const randomTop = Math.random() * maxTop
        const randomLeft = Math.random() * maxLeft
        
        logo.style.top = randomTop + 'px'
        logo.style.left = randomLeft + 'px'
        
        logo.dataset.topDelta = Math.random() > 0.5 ? '2' : '-2'
        logo.dataset.leftDelta = Math.random() > 0.5 ? '2' : '-2'
      })
    })
  }

  input.addEventListener("input", function() {
    const value = parseFloat(this.value);
    const screens = document.querySelectorAll('.result-panel')
    const share = document.querySelector('.share')

    if (!value || value <= 0) {
      crousText.textContent = "0";
      crousBourse.textContent = "0";
      pizzaText.textContent = "0";
      robux.textContent = "0";
      gems.textContent = "0";
      tastycrousty.textContent = "0";
      jnr28k.textContent = "0";
      hexacon.textContent = "0";  
      kebab.textContent = "0";
      vbucks.textContent = "0";
      vody.textContent = "0";
      retraite.textContent = "0 ms";
      results.classList.add("hidden");
      screens.forEach((screen) => {
        screen.classList.add("hidden");
        screen.style.display = "none";
      })
      share.classList.add("hidden");
      share.style.display = "none";
      return;
    }

    crousText.textContent = Math.round((value / CROUS_PRICE)* 100) /100;
    crousBourse.textContent = Math.round((value / CROUS_BOURSE_PRICE)* 100) /100;
    pizzaText.textContent = Math.round((value / PIZZA_PRICE)* 100) /100;
    robux.textContent = Math.round((value / ROBUX_PRICE)* 100) /100;
    gems.textContent = Math.round((value / CLASH_ROYALE_GEM)* 100) /100;
    tastycrousty.textContent = Math.round((value / CROUSTY)* 100) /100;
    jnr28k.textContent = Math.round((value / JNR_28_K)* 100) /100;
    hexacon.textContent = Math.round((value / HEXACON)* 100);
    kebab.textContent = Math.round((value / KEBAB_PRICE)* 100) /100;
    vbucks.textContent = Math.round((value / VBUCKS_PRICE)* 100) /100;
    vody.textContent = Math.round((value / VODY_22_25CL) * 100) / 100;
    const fundedSeconds = value / RETRAITE_EUR_PER_SECOND;
    retraite.textContent = formatDuration(fundedSeconds);
    
    results.classList.remove("hidden");
    screens.forEach((screen) => {
      screen.classList.remove("hidden");
      screen.style.display = "flex";
    })

    share.classList.remove("hidden");
    share.style.display = "flex";
    
    setTimeout(initializeLogos, 0);
  });

  // put value in "prix" parameter  : https://wepfen.github.io/off-topic/combien2crous/?prix=12

  const params = new URLSearchParams(window.location.search);
  const price = params.get("prix") || "0";

  if (!isNaN(price) && price.trim() !== "") {
    document.getElementById("amount").value = Number(price);
    input.dispatchEvent(new Event("input"));
  }

  // DVD Logo on panels - Initialize on page load
  initializeLogos()

  function animate() {
    const screens = document.querySelectorAll('.result-panel')
    
    screens.forEach(screen => {
      const rect = screen.getBoundingClientRect()
      const logos = screen.querySelectorAll('.logo')
      
      logos.forEach(logo => {
        const currentTop = logo.offsetTop
        const currentLeft = logo.offsetLeft
        
        const currentRight = currentLeft + logo.offsetWidth
        const currentBottom = currentTop + logo.offsetHeight
        
        let topDelta = parseFloat(logo.dataset.topDelta) || 2
        let leftDelta = parseFloat(logo.dataset.leftDelta) || 2
        
        if (currentBottom >= rect.height) topDelta = -2
        if (currentTop <= 0) topDelta = 2
        if (currentRight >= rect.width) leftDelta = -2
        if (currentLeft <= 0) leftDelta = 2
        
        logo.dataset.topDelta = topDelta
        logo.dataset.leftDelta = leftDelta
        
        logo.style.top = currentTop + topDelta + 'px'
        logo.style.left = currentLeft + leftDelta + 'px'
      })
    })

    requestAnimationFrame(animate)
  }

  animate()
});