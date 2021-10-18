const rtf = new Intl.RelativeTimeFormat("en")

function makeDatesRelative(): void {
  const dateElements = document.querySelectorAll<HTMLElement>("[data-date]")

  dateElements.forEach((element) => {
    if (element.dataset.date === "Invalid Date") {
      return
    }

    const date = new Date(element.dataset.date)
    const deltaDays = Math.round((date.getTime() - Date.now()) / (1000 * 3600 * 24))

    if (deltaDays === 0) {
      const deltaHours = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60))

      if (deltaHours === 0) {
        element.textContent = "less than an hour ago"
      } else {
        element.textContent = rtf.format(deltaHours, "hours")
      }
    } else {
      element.textContent = rtf.format(deltaDays, "days")
    }

    element.title = date.toString()
  })
}

function onPageLoad() {
  makeDatesRelative()
}

onPageLoad()
