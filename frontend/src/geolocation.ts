export function currentPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) { reject(new Error('A localização exige HTTPS. Abra o endereço seguro do sistema.')); return }
    if (!navigator.geolocation) { reject(new Error('Este navegador não oferece localização. Use um navegador atualizado.')); return }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject(new Error(error.code === 1 ? 'Localização negada. Autorize o acesso à localização nas configurações do navegador e tente novamente.' : error.code === 3 ? 'A localização demorou demais. Verifique o GPS e tente novamente.' : 'Localização indisponível. Ative o GPS e tente novamente.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
