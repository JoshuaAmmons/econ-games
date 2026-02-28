import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/shared/Button';
import { LandingScene } from '../components/LandingScene';
import { Users, User } from 'lucide-react';

export const Home: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-start pt-[10vh] sm:pt-[12vh] relative overflow-hidden">
      <LandingScene />

      <div className="relative z-10 max-w-md w-full mx-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Economics Game Platform
          </h1>
          <p className="text-gray-600">
            Real-time market experiments for students
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8 space-y-4">
          <Button
            className="w-full flex items-center justify-center gap-2"
            onClick={() => navigate('/join')}
            size="lg"
          >
            <User className="w-5 h-5" />
            Join Session as Student
          </Button>

          <Button
            variant="secondary"
            className="w-full flex items-center justify-center gap-2"
            onClick={() => navigate('/admin')}
            size="lg"
          >
            <Users className="w-5 h-5" />
            Admin Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};
