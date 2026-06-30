export const strings = {
  en: {
    home: 'Home', shop: 'Shop', cart: 'Cart',
    account: 'Account', search: 'Search ShopEasy...',
    addToCart: 'Add to Cart', buyNow: 'Buy Now',
    wishlist: 'Wishlist', settings: 'Settings',
    signIn: 'Sign In', signOut: 'Sign Out',
    orders: 'My Orders', messages: 'Messages',
    save: 'Save', cancel: 'Cancel',
    thankYou: 'Thank you!', welcome: 'Welcome',
    loading: 'Loading...', error: 'Something went wrong'
  },
  ny: {
    home: 'Kwawo', shop: 'Msika', cart: 'Dengu',
    account: 'Akaunti', search: 'Sakani pa ShopEasy...',
    addToCart: 'Yikani Mu Dengu', buyNow: 'Gulani Tsopano',
    wishlist: 'Zokhumba', settings: 'Zikhazikiko',
    signIn: 'Lowani', signOut: 'Tulukani',
    orders: 'Malamulo Anga', messages: 'Mauthenga',
    save: 'Sungani', cancel: 'Siyani',
    thankYou: 'Zikomo!', welcome: 'Takulandirani',
    loading: 'Kulaza...', error: 'Pali vuto lina'
  }
}

export const t = (key) => {
  const lang = localStorage.getItem('se_language') || 'en'
  return strings[lang]?.[key] || strings.en[key] || key
}

export const applyTranslations = () => {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n)
  })
}
