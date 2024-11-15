import React from 'react'
import logo from '../assets/logo.png'

const AuthLayouts = ({children}) => {
  return (
    <>
        <header className='flex justify-center items-center py-3 h-20 shadow-md bg-white'>
              {/* <img 
                src={logo}
                alt='logo'
                width={180}
                height={60}
              /> */}
              <p className="text-4xl font-bold text-gray-800 tracking-wide uppercase mt-2">ChatterBox</p>
        </header>

        { children }
    </>
  )
}

export default AuthLayouts
