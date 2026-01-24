const LandingPage: React.FC = () => {
  return (
    <div className="w-full min-h-screen relative bg-[#222429]">
      {/* Navbar */}
      <div className="w-full h-25 fixed left-0 top-0 z-20 bg-[#282A35] flex items-center justify-between px-20">
        {/* Codexia Logo */}
        <a
          href="/"
          className="flex items-center text-[36px] font-inter font-bold leading-13.5"
        >
          <span className="text-[#71DD83] font-bold">C</span>
          <span className="text-white font-bold">odexia</span>
        </a>
        {/* Nav Items */}
        <div className="flex items-center gap-10">
          <a
            href="#"
            className="text-white text-lg font-inter font-medium leading-7.5 no-underline focus:outline-none"
          >
            About Us
          </a>
          <a
            href="#"
            className="text-white text-lg font-inter font-medium leading-7.5"
          >
            Contact Us
          </a>
          <button className="px-5 py-3 bg-[#71DD83] rounded-lg flex items-center cursor-pointer hover:opacity-90">
            <span className="text-black text-base font-inter font-medium leading-6">
              Create Session
            </span>
          </button>
        </div>
      </div>

      {/* Hero Section */}

      {/* Features Section */}

      {/* Another Features Section */}

      {/* Reviews Section */}

      {/* Footer */}
    </div>
  );
};

export default LandingPage;
