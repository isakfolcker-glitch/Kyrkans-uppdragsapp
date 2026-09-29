export interface PassFormValues {
  title: string
  date: string
  timeStart: string
  plats: string
  spots: number
  groups: string[]
}

export interface PassFormErrors {
  title?: string
  date?: string
  timeStart?: string
  plats?: string
  spots?: string
  groups?: string
}

export function validatePassForm(values: PassFormValues): PassFormErrors {
  const errors: PassFormErrors = {}

  if (!values.title.trim()) errors.title = 'Ange en titel.'
  if (!values.date) errors.date = 'Välj ett datum.'
  if (!values.timeStart) errors.timeStart = 'Välj en starttid.'
  if (!values.plats.trim()) errors.plats = 'Ange en plats.'
  if (!Number.isFinite(values.spots) || values.spots < 1) errors.spots = 'Antal platser måste vara minst 1.'
  if (values.groups.length === 0) errors.groups = 'Välj minst en grupp.'

  return errors
}
